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
// The user's own enrolled hand shape (bio CUSTOM_PROMPT). Every challenge = this + CANNED_PROMPT_COUNT
// random GESTURES, in random order (docs/biometrics.md#gesture-prompts).
export const CUSTOM_GESTURE = "Custom";
export const CANNED_PROMPT_COUNT = 1;
export const LIVENESS_CHALLENGE_TTL_MS = 120 * 1000;
export const LIVENESS_CAPTURE_WINDOW_MS = 8 * 1000;
export const LIVENESS_MAX_ATTEMPTS = 3;
export const ENROLL_FRAME_COUNT = 5;
export const MAX_LIVENESS_FRAMES = 80;
export const BIO_TIMEOUT_MS = 20 * 1000;
export const MAX_FRAME_BYTES = 300_000; // per JPEG frame (bio enforces the same cap)
export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 480;
export const CAPTURE_FPS = 10;
export const CAPTURE_JPEG_QUALITY = 0.7;
export const CAPTURE_COUNTDOWN_MS = 3 * 1000; // "get ready" before the capture window starts
export const ENROLL_FRAME_INTERVAL_MS = 300; // spacing between the 5 enrollment frames
export const BIO_STATUS_CACHE_MS = 10 * 1000; // how long web trusts bio's /healthz fake flag
// Custom gesture enrollment: 3 captures of 5 frames, the user lowers the hand in between.
export const GESTURE_ENROLL_CAPTURES = 3;
export const GESTURE_ENROLL_FRAMES_PER_CAPTURE = 5;
export const GESTURE_ENROLL_FRAME_COUNT = GESTURE_ENROLL_CAPTURES * GESTURE_ENROLL_FRAMES_PER_CAPTURE;
export const GESTURE_ENROLL_FRAME_INTERVAL_MS = 250;
export const GESTURE_ENROLL_READY_MS = 2 * 1000; // "show your gesture" before each capture
export const GESTURE_ENROLL_REST_MS = 1500; // "lower your hand" between captures
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
// Binding cookie must outlive the longest possible request: max cooldown + idle window.
export const RECOVERY_BIND_TTL_MS = RECOVERY_COOLDOWN_CODE_ONLY_MS + RECOVERY_IDLE_EXPIRY_MS;
// Total failed liveness attempts per recovery request (across challenges) before it is cancelled.
export const RECOVERY_LIVENESS_MAX_FAILS = 3;
// /recover/[id] re-reads the state this often while cooling down.
export const RECOVERY_POLL_MS = 5 * 1000;
// ===== end recovery =====

// ===== oauth ("Sign in with Secure" for sample apps, docs/oauth.md) =====
export const OAUTH_CODE_TTL_MS = 60 * 1000;
// How long a passed app liveness check can be spent on one approval.
export const OAUTH_LIVENESS_PASS_TTL_MS = 2 * 60 * 1000;
// acr_values an app may ask for. "passkey": fresh passkey (within REAUTH_WINDOW_MS).
// "liveness": fresh passkey AND a face + gesture check, for high-risk actions.
export const OAUTH_ACRS = ["passkey", "liveness"] as const;
export const OAUTH_BINDING_MESSAGE_MAX = 80;
// Registered client apps. Public clients: PKCE (S256) + exact redirect_uri match, no secret.
export const OAUTH_CLIENTS: Record<string, { name: string; redirectUris: string[] }> = {
  mockbank: {
    name: "Mock Bank of Localhost",
    redirectUris: ["http://localhost:4000/callback"],
  },
};
// ===== end oauth =====
