"use client";
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api, ApiClientError } from "@/lib/api";

// Client side of every passkey ceremony. Server contract: POST <optionsPath> → {options},
// POST <verifyPath> with {response, ...verifyBody} → route-specific JSON.

type Common = {
  optionsPath: string;
  verifyPath: string;
  optionsBody?: unknown;
  verifyBody?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export async function registerPasskey<T = Record<string, unknown>>(c: Common): Promise<T> {
  const { options } = await api<{ options: PublicKeyCredentialCreationOptionsJSON }>(c.optionsPath, {
    method: "POST",
    json: c.optionsBody ?? {},
    headers: c.headers,
  });
  const response = await browserStep(() => startRegistration({ optionsJSON: options }));
  return api<T>(c.verifyPath, { method: "POST", json: { response, ...c.verifyBody }, headers: c.headers });
}

export async function authenticatePasskey<T = Record<string, unknown>>(
  c: Common & { autofill?: boolean },
): Promise<T> {
  const { options } = await api<{ options: PublicKeyCredentialRequestOptionsJSON }>(c.optionsPath, {
    method: "POST",
    json: c.optionsBody ?? {},
    headers: c.headers,
  });
  const response = await browserStep(() =>
    startAuthentication({ optionsJSON: options, useBrowserAutofill: c.autofill ?? false }),
  );
  return api<T>(c.verifyPath, { method: "POST", json: { response, ...c.verifyBody }, headers: c.headers });
}

/** Fresh passkey assertion for the current session (sets reauth_at). */
export function reauth(): Promise<unknown> {
  return authenticatePasskey({ optionsPath: "/api/auth/reauth/options", verifyPath: "/api/auth/reauth/verify" });
}

/** Run a sensitive action; if the server says REAUTH_REQUIRED, do a passkey check and retry once. */
export async function withReauth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiClientError && e.code === "REAUTH_REQUIRED") {
      await reauth();
      return fn();
    }
    throw e;
  }
}

async function browserStep<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "NotAllowedError" || name === "AbortError") {
      throw new ApiClientError("CANCELLED", "Cancelled or timed out. Try again.", 0);
    }
    if (name === "InvalidStateError") {
      throw new ApiClientError("ALREADY_REGISTERED", "This device is already registered.", 0);
    }
    throw new ApiClientError("WEBAUTHN_FAILED", "Your device couldn't complete the passkey step.", 0);
  }
}

/** User-facing message for any error thrown by api()/passkey helpers. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  return "Something went wrong.";
}
