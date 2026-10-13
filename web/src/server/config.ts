// ALL web tunables live here (AGENTS.md rule 10). Never inline TTLs or thresholds.
//
// Parallel-work rule: each agent edits ONLY its own section below. Add new
// constants at the END of your section. Do not reorder or touch other sections.

// ===== foundation (master) =====
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;
export const WEBAUTHN_CHALLENGE_TTL_MS = 300 * 1000;
export const WEBAUTHN_TIMEOUT_MS = 60 * 1000;
export const FLOW_COOKIE = "flow";
export const SESSION_COOKIE = "sid";
// ===== end foundation =====

// ===== auth (agent A) =====
export const RISK_WEIGHTS = { new_country: 40, ua_change: 20, recent_failures: 20 } as const;
export const RISK_STEP_UP_MIN = 30;
export const RISK_BLOCK_MIN = 80;
export const RECENT_FAILURES_COUNT = 3;
export const RECENT_FAILURES_WINDOW_MS = 15 * 60 * 1000;
// ===== end auth =====

// ===== bio (agent B) =====
export const GESTURES = [
  "Closed_Fist",
  "Open_Palm",
  "Pointing_Up",
  "Thumb_Up",
  "Thumb_Down",
  "Victory",
  "ILoveYou",
] as const;
export const PROMPT_COUNT = 3;
export const LIVENESS_CHALLENGE_TTL_MS = 120 * 1000;
export const LIVENESS_CAPTURE_WINDOW_MS = 8 * 1000;
export const LIVENESS_MAX_ATTEMPTS = 3;
export const ENROLL_FRAME_COUNT = 5;
export const MAX_LIVENESS_FRAMES = 80;
export const BIO_TIMEOUT_MS = 20 * 1000;
// ===== end bio =====

// ===== devices + admin (agent C) =====
export const LINK_TTL_MS = 5 * 60 * 1000;
export const LINK_POLL_MS = 2 * 1000;
export const LINK_BIND_COOKIE = "link_bind";
// ===== end devices + admin =====

// ===== recovery (agent D) =====
export const RECOVERY_COOLDOWN_CODE_LIVENESS_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_COOLDOWN_CODE_ONLY_MS = 72 * 60 * 60 * 1000;
export const RECOVERY_IDLE_EXPIRY_MS = 48 * 60 * 60 * 1000;
export const RECOVERY_BIND_COOKIE = "rec_bind";
// ===== end recovery =====
