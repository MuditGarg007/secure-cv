import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import type { Challenge, ChallengePurpose, Credential, User } from "@/server/db/schema";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import { WEBAUTHN_CHALLENGE_TTL_MS, WEBAUTHN_TIMEOUT_MS } from "@/server/config";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { requestMeta } from "@/server/request-meta";
import { getUserById } from "@/server/users";
import {
  consumeChallenge,
  createChallenge,
  setFlowCookie,
  takeFlowCookie,
} from "@/server/auth/challenges";
import {
  activeCredentials,
  getCredentialByWebauthnId,
  revokeCredential,
} from "@/server/auth/credentials";

// Shared WebAuthn ceremony helpers. Every passkey ceremony in the app goes through
// these four functions, which implement the verify checklist in docs/auth.md.
// Routes own: zod parsing, session handling, and the SUCCESS auth_events row.
// These helpers own: challenge storage + flow cookie, origin/rpID/UV/challenge checks,
// signCount clone detection, and FAILURE events (login_fail, clone_detected).

export type RegistrationPurpose = Extract<
  ChallengePurpose,
  "register" | "add_key" | "link_register" | "recovery_register"
>;
export type AuthenticationPurpose = Extract<ChallengePurpose, "login" | "reauth" | "link_approve">;

/** zod schemas for the browser's JSON responses (shape check only; crypto checks happen below). */
export const registrationResponseSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z.object({ clientDataJSON: z.string(), attestationObject: z.string() }).loose(),
  })
  .loose();
export const authenticationResponseSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z
      .object({ clientDataJSON: z.string(), authenticatorData: z.string(), signature: z.string() })
      .loose(),
  })
  .loose();

/** Fresh random 32-byte WebAuthn user.id (base64url) for a new account. */
export function newWebauthnUserId(): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)));
}

function clientOrigin(clientDataJSON: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8"));
    return typeof parsed.origin === "string" ? parsed.origin : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- registration

export async function startRegistration(opts: {
  purpose: RegistrationPurpose;
  user: Pick<User, "webauthnUserId" | "handle" | "displayName">;
  /** Existing user (add_key, link_register, recovery_register). Null for sign-up. */
  userId?: string | null;
  /** Credentials of this user are excluded so the same authenticator isn't added twice. */
  excludeUserId?: string;
  targetId?: string | null;
  /** Stored on the challenge, returned by finishRegistration (e.g. pending sign-up). */
  data?: Record<string, unknown> | null;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const exclude = opts.excludeUserId ? activeCredentials(opts.excludeUserId) : [];
  const options = await generateRegistrationOptions({
    rpID: env.RP_ID,
    rpName: env.RP_NAME,
    userID: isoBase64URL.toBuffer(opts.user.webauthnUserId),
    userName: opts.user.handle,
    userDisplayName: opts.user.displayName,
    attestationType: "none",
    timeout: WEBAUTHN_TIMEOUT_MS,
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: exclude.map((c) => ({ id: c.credentialId, transports: c.transports })),
  });
  const ch = createChallenge({
    purpose: opts.purpose,
    challenge: options.challenge,
    userId: opts.userId ?? null,
    targetId: opts.targetId ?? null,
    data: opts.data ?? null,
    ttlMs: WEBAUTHN_CHALLENGE_TTL_MS,
  });
  await setFlowCookie(ch.id);
  return options;
}

export type NewCredential = {
  credentialId: string;
  publicKey: Buffer;
  signCount: number;
  transports: string[];
};

/** Verifies a registration. Does NOT insert; call saveCredential once the user row exists. */
export async function finishRegistration(opts: {
  purpose: RegistrationPurpose;
  response: RegistrationResponseJSON;
  targetId?: string;
}): Promise<{ challenge: Challenge; credential: NewCredential }> {
  const challenge = consumeChallenge(await takeFlowCookie(), opts.purpose, opts.targetId);
  if (clientOrigin(opts.response.response.clientDataJSON) !== env.ORIGIN) {
    throw new ApiError("ORIGIN_MISMATCH", "This passkey was created for a different site.");
  }
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: opts.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: env.ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: true,
    });
  } catch {
    throw new ApiError("WEBAUTHN_FAILED");
  }
  if (!verification.verified) throw new ApiError("WEBAUTHN_FAILED");
  const c = verification.registrationInfo.credential;
  if (getCredentialByWebauthnId(c.id)) {
    throw new ApiError("WEBAUTHN_FAILED", "This passkey is already registered.");
  }
  return {
    challenge,
    credential: {
      credentialId: c.id,
      publicKey: Buffer.from(c.publicKey),
      signCount: c.counter,
      transports: c.transports ?? [],
    },
  };
}

export async function saveCredential(opts: {
  userId: string;
  credential: NewCredential;
  label: string;
}): Promise<Credential> {
  const { ua } = await requestMeta();
  return db
    .insert(schema.credentials)
    .values({
      userId: opts.userId,
      credentialId: opts.credential.credentialId,
      publicKey: opts.credential.publicKey,
      signCount: opts.credential.signCount,
      transports: opts.credential.transports,
      label: opts.label,
      lastUsedAt: Date.now(),
      lastUsedUa: ua,
    })
    .returning()
    .get();
}

// -------------------------------------------------------------- authentication

export async function startAuthentication(opts: {
  purpose: AuthenticationPurpose;
  /** Restrict to this user's active credentials (reauth, link_approve). Omit for discoverable login. */
  userId?: string;
  targetId?: string | null;
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const allow = opts.userId ? activeCredentials(opts.userId) : [];
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: "required",
    timeout: WEBAUTHN_TIMEOUT_MS,
    allowCredentials: allow.map((c) => ({ id: c.credentialId, transports: c.transports })),
  });
  const ch = createChallenge({
    purpose: opts.purpose,
    challenge: options.challenge,
    userId: opts.userId ?? null,
    targetId: opts.targetId ?? null,
    ttlMs: WEBAUTHN_CHALLENGE_TTL_MS,
  });
  await setFlowCookie(ch.id);
  return options;
}

/**
 * Verifies an assertion per the docs/auth.md checklist and updates sign_count / last_used.
 * Returns the (updated) credential and its user. Throws ApiError:
 *   ORIGIN_MISMATCH (and logs login_fail reason=origin_mismatch), CHALLENGE_EXPIRED,
 *   WEBAUTHN_FAILED, CREDENTIAL_REVOKED, FORBIDDEN (wrong user), BLOCKED (clone detected).
 * The caller writes the success event and handles the session.
 */
export async function finishAuthentication(opts: {
  purpose: AuthenticationPurpose;
  response: AuthenticationResponseJSON;
  targetId?: string;
  /** For reauth / approvals: the assertion must come from this user's credential. */
  expectedUserId?: string;
}): Promise<{
  challenge: Challenge;
  credential: Credential;
  user: User;
  /** Credential values BEFORE this assertion (risk check compares the UA against these). */
  previous: Pick<Credential, "signCount" | "lastUsedAt" | "lastUsedUa">;
}> {
  const cred = getCredentialByWebauthnId(opts.response.id);
  const fail = async (reason: string) =>
    logEvent({
      type: "login_fail",
      userId: cred?.userId ?? null,
      credentialId: cred?.id ?? null,
      metadata: { purpose: opts.purpose, reason },
    });

  // Origin first, so a relayed assertion is reported as such even if the challenge is gone.
  const origin = clientOrigin(opts.response.response.clientDataJSON);
  if (origin !== env.ORIGIN) {
    await fail("origin_mismatch");
    throw new ApiError("ORIGIN_MISMATCH", "This sign-in came from a different site.");
  }

  let challenge: Challenge;
  try {
    challenge = consumeChallenge(await takeFlowCookie(), opts.purpose, opts.targetId);
  } catch (e) {
    await fail("challenge_expired");
    throw e;
  }
  if (!cred) {
    await fail("unknown_credential");
    throw new ApiError("WEBAUTHN_FAILED", "This passkey isn't registered here.");
  }
  if (cred.revokedAt) {
    await fail("credential_revoked");
    throw new ApiError("CREDENTIAL_REVOKED", "This device was removed from your account.");
  }
  if (opts.expectedUserId && cred.userId !== opts.expectedUserId) {
    await fail("wrong_user");
    throw new ApiError("FORBIDDEN", "Use a passkey from this account.");
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: opts.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: env.ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: true,
      // counter: 0 so the library skips its own counter check; we do clone detection below
      // AFTER the signature is verified.
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(cred.publicKey),
        counter: 0,
        transports: cred.transports,
      },
    });
  } catch {
    await fail("verification_failed");
    throw new ApiError("WEBAUTHN_FAILED");
  }
  if (!verification.verified) {
    await fail("verification_failed");
    throw new ApiError("WEBAUTHN_FAILED");
  }

  const stored = cred.signCount;
  const next = verification.authenticationInfo.newCounter;
  if ((stored > 0 || next > 0) && next <= stored) {
    revokeCredential(cred.id, "clone_detected");
    await logEvent({
      type: "clone_detected",
      userId: cred.userId,
      credentialId: cred.id,
      metadata: { stored, received: next },
    });
    notify(cred.userId, `A copy of your passkey "${cred.label}" was detected. We removed it.`);
    throw new ApiError("BLOCKED", "We stopped this sign-in. Check your other devices.");
  }

  const { ua } = await requestMeta();
  const credential = db
    .update(schema.credentials)
    .set({ signCount: next, lastUsedAt: Date.now(), lastUsedUa: ua })
    .where(eq(schema.credentials.id, cred.id))
    .returning()
    .get();
  const user = getUserById(cred.userId);
  if (!user) throw new ApiError("WEBAUTHN_FAILED");
  const previous = { signCount: stored, lastUsedAt: cred.lastUsedAt, lastUsedUa: cred.lastUsedUa };
  return { challenge, credential, user, previous };
}
