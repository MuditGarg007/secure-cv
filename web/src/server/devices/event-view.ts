// Pure mapping of auth_events rows to what /activity and /admin show. No db/env/next imports.
import type { AuthEvent, AuthEventType } from "@/server/db/schema";

export type EventTone = "allowed" | "step_up" | "blocked" | "device" | "info";

export const TONE_ICON: Record<EventTone, string> = {
  allowed: "✓",
  step_up: "⚠",
  blocked: "⛔",
  device: "🔑",
  info: "•",
};

const TONE: Record<AuthEventType, EventTone> = {
  register: "allowed",
  login_success: "allowed",
  reauth: "allowed",
  step_up_pass: "allowed",
  recovery_liveness_pass: "allowed",
  recovery_completed: "allowed",
  step_up_required: "step_up",
  step_up_fail: "step_up",
  recovery_started: "step_up",
  recovery_liveness_fail: "step_up",
  login_fail: "blocked",
  blocked: "blocked",
  clone_detected: "blocked",
  device_linked: "device",
  credential_added: "device",
  credential_revoked: "device",
  logout: "info",
  bio_enrolled: "info",
  bio_deleted: "info",
  recovery_code_generated: "info",
  recovery_cancelled: "info",
  admin_action: "info",
  app_authorized: "allowed",
};

const LABEL: Record<AuthEventType, string> = {
  register: "Account created",
  login_success: "Signed in",
  login_fail: "Sign-in failed",
  step_up_required: "Extra check asked",
  step_up_pass: "Extra check passed",
  step_up_fail: "Extra check failed",
  blocked: "Sign-in blocked",
  logout: "Signed out",
  reauth: "Confirmed with passkey",
  bio_enrolled: "Face added",
  bio_deleted: "Face removed",
  device_linked: "Device link",
  credential_added: "Security key added",
  credential_revoked: "Device removed",
  recovery_code_generated: "New recovery code",
  recovery_started: "Account recovery started",
  recovery_liveness_pass: "Recovery face check passed",
  recovery_liveness_fail: "Recovery face check failed",
  recovery_cancelled: "Account recovery cancelled",
  recovery_completed: "Account recovered",
  clone_detected: "Copied passkey detected",
  admin_action: "Admin action",
  app_authorized: "Signed in to an app",
};

const LINK_STAGE_LABEL: Record<string, string> = {
  approved: "New device approved",
  denied: "New device denied",
  registered: "New device added",
};

export type EventView = {
  tone: EventTone;
  icon: string;
  label: string;
  /** Phishing demo: a passkey assertion that came from another site. Shown loudly. */
  phishing: boolean;
};

export function isOriginMismatch(e: Pick<AuthEvent, "type" | "metadata">): boolean {
  return e.type === "login_fail" && e.metadata?.reason === "origin_mismatch";
}

/** Icon + user-safe label. Reads metadata only to pick a label; never returns it. */
export function viewEvent(e: Pick<AuthEvent, "type" | "metadata">): EventView {
  const tone = TONE[e.type] ?? "info";
  let label = LABEL[e.type] ?? e.type;
  const phishing = isOriginMismatch(e);
  if (phishing) label = "Blocked: sign-in from a fake site";
  if (e.type === "device_linked") {
    const stage = e.metadata?.stage;
    if (typeof stage === "string" && LINK_STAGE_LABEL[stage]) label = LINK_STAGE_LABEL[stage];
  }
  return { tone, icon: TONE_ICON[tone], label, phishing };
}

/** Event types the admin feed can filter on (validates the ?type= search param). */
export function parseEventType(v: unknown, all: readonly AuthEventType[]): AuthEventType | null {
  return typeof v === "string" && (all as readonly string[]).includes(v) ? (v as AuthEventType) : null;
}
