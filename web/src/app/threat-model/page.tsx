import type { Metadata } from "next";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VoiceButton } from "@/components/common/VoiceButton";
import { PrintButton } from "./PrintTrigger";

export const metadata: Metadata = {
  title: "Threat model · Secure",
  description: "Attacks this passwordless system covers, partially covers, and does not cover.",
};

// Public page (no session). Kept in sync with docs/security.md by agent D. Printable: the
// print CSS below hides the voice/print buttons and prints the tables full-width for PDF.

const covered: [string, string][] = [
  ["Phishing / look-alike site", "WebAuthn origin + rpID binding, plus a server-side origin check on every assertion. A credential signed for a clone is rejected (ORIGIN_MISMATCH). Shown live in the phishing demo."],
  ["Password reuse, stuffing, breach dumps", "No passwords exist. The server stores only public keys, so a dump has nothing to replay."],
  ["SIM swap, OTP interception, OTP social engineering", "No SMS, email or TOTP one-time codes anywhere in sign-in or recovery."],
  ["Database leak", "Only public keys, argon2id recovery-code hashes, and AES-256-GCM face + gesture templates whose key lives in the bio service, not the web DB."],
  ["Photo or replayed video at step-up", "Every check asks for the user's own gesture plus one random built-in sign, in random order, each bound to the matching face in the same frames, inside a tight time window. A recording of an earlier check won't have this one's sign in this order."],
  ["Spliced video (face + hand from different clips)", "Face-embedding continuity check plus gesture/face co-presence in the same frames."],
  ["Stolen unlocked device", "Each passkey still needs the device's own biometric or PIN (user verification required). Revoke it from another device or an admin."],
  ["Lost device", "Revoking its credential kills its sessions; recovery issues a new passkey and revokes all the old ones."],
  ["Cloned authenticator", "A signCount regression auto-revokes the credential and alerts the user (clone_detected)."],
  ["Session theft", "Session cookie is HttpOnly, SameSite=Lax, stored only as a hash, with absolute expiry and rotation on step-up."],
  ["Account takeover via recovery", "Recovery needs the recovery code AND liveness (or a longer wait), a cooldown, alerts to every signed-in device, a cancel button, and browser binding."],
  ["Approval / assertion replay", "Challenges are single-use with a short TTL; link approvals and recovery registrations are bound to a specific target id."],
];

const partial: [string, string][] = [
  ["Real-time deepfake via a virtual camera", "Random prompts and hand-near-face raise the bar but don't close it. Liveness never stands alone: a passkey (or recovery code) is always required first."],
  ["Someone who has watched the user's gesture", "The gesture is a personal factor, not a secret against anyone who has seen a check: they still need the user's face live, the random sign and the passkey first. Only 14 sign orders exist, so the random part is a speed bump, not a vault."],
  ["Victim tricked into reading out their code and doing liveness", "The cooldown, alerts and cancel button let the real owner stop it — as long as they still hold one signed-in device."],
  ["User who lost every device", "Recovery still works via the code, but no device is left to receive the alert. Out-of-band (email) alerts are a stretch goal."],
  ["Basic-phone / low-literacy users", "Security key, NFC card, or a phone-as-key over the hybrid QR flow, plus voice prompts on every screen. No IVR / USSD path."],
];

const notCovered: string[] = [
  "Malware controlling the user's device or browser.",
  "Coercion (a user forced to authenticate).",
  "Compromise of the passkey sync provider (Apple / Google / etc.).",
  "An attacker holding BOTH the web database AND the bio template key.",
  "Rate limiting / denial of service (only per-challenge attempt limits exist).",
  "Production-grade biometrics: the face model is non-commercial, there is no passive anti-spoof model, and no ISO/IEC 30107-3 liveness certification in this version.",
];

const INTRO =
  "This is the threat model for a passwordless sign-in system built on passkeys, with face and " +
  "gesture liveness as a step-up and recovery factor only. Below: the attacks it covers, the ones " +
  "it partially covers, and the ones it does not.";

export default function ThreatModelPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Threat model</h1>
          <p className="text-sm text-muted-foreground">
            Passkeys first, biometrics second. Last reviewed with the built system.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <VoiceButton text={INTRO} />
          <PrintButton />
        </div>
      </div>

      <p className="mb-6 max-w-prose text-sm">{INTRO}</p>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-green-700 dark:text-green-500">
          <ShieldCheck className="size-5" /> Covered
          <Badge variant="secondary">{covered.length}</Badge>
        </h2>
        <ThreatTable rows={covered} head="Mitigation" />
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-amber-700 dark:text-amber-500">
          <ShieldQuestion className="size-5" /> Partially covered
          <Badge variant="secondary">{partial.length}</Badge>
        </h2>
        <ThreatTable rows={partial} head="Status" />
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-destructive">
          <ShieldAlert className="size-5" /> Not covered
          <Badge variant="secondary">{notCovered.length}</Badge>
        </h2>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          {notCovered.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Hackathon demo, not a production deployment. The phishing-resistance claim is demonstrated live; see the
        project&apos;s phishing demo.
      </p>
    </main>
  );
}

// A stacked list that reads at 360 px (threat over mitigation) and becomes two columns on wider
// screens and in print. No horizontal-scroll table, which would hide the mitigation on a phone.
function ThreatTable({ rows, head }: { rows: [string, string][]; head: string }) {
  return (
    <dl className="divide-y rounded-lg border text-sm">
      {rows.map(([threat, detail]) => (
        <div key={threat} className="grid gap-x-4 gap-y-1 p-3 sm:grid-cols-[2fr_3fr] print:grid-cols-[2fr_3fr] break-inside-avoid">
          <dt className="font-medium text-foreground">{threat}</dt>
          <dd className="text-muted-foreground">
            <span className="sr-only">{head}: </span>
            {detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}
