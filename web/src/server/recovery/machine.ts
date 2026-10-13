// Recovery state machine (docs/flows.md#recovery-state-machine). PURE: no db, env or next
// imports, so it is unit tested directly. The service layer loads a request, calls
// `transition`, and persists the result.
//
//   start (face enrolled)   → pending_liveness
//   start (no face)         → cooling_down
//   pending_liveness  ─pass─────────► cooling_down
//   pending_liveness  ─3 fails──────► cancelled
//   cooling_down      ─time passes──► ready        (lazy, on every transition)
//   ready             ─new passkey──► completed
//   any open state    ─cancel───────► cancelled    (user session or admin)
//   any open state    ─48 h idle────► expired      (lazy, on every transition)

export type RecoveryState =
  | "pending_liveness"
  | "cooling_down"
  | "ready"
  | "completed"
  | "cancelled"
  | "expired";
export type RecoveryMethod = "code_liveness" | "code_only";

export const OPEN_STATES: readonly RecoveryState[] = ["pending_liveness", "cooling_down", "ready"];

export function isOpen(state: RecoveryState): boolean {
  return OPEN_STATES.includes(state);
}

export type MachineConfig = {
  cooldownCodeLivenessMs: number;
  cooldownCodeOnlyMs: number;
  idleExpiryMs: number;
  /** RECOVERY_COOLDOWN_OVERRIDE_S * 1000 when set: replaces BOTH cooldowns (demo). */
  cooldownOverrideMs?: number;
};

/** The fields of a recovery_requests row the machine needs (ms timestamps). */
export type MachineRequest = {
  state: RecoveryState;
  method: RecoveryMethod;
  cooldownUntil: number | null;
  updatedAt: number;
};

export type RecoveryEvent =
  | { type: "tick" } // just apply time-based edges
  | { type: "liveness_pass" }
  | { type: "liveness_fail_final" } // out of liveness attempts
  | { type: "complete" } // new passkey registered
  | { type: "cancel"; by: "user" | "admin" };

export type MachineResult = {
  state: RecoveryState;
  cooldownUntil: number | null;
  updatedAt: number;
  cancelledBy?: "user" | "admin";
};

export type TransitionResult = MachineResult | { error: "RECOVERY_STATE" };

export function cooldownMs(method: RecoveryMethod, cfg: MachineConfig): number {
  if (cfg.cooldownOverrideMs !== undefined) return cfg.cooldownOverrideMs;
  return method === "code_liveness" ? cfg.cooldownCodeLivenessMs : cfg.cooldownCodeOnlyMs;
}

/** State of a brand-new request. */
export function startState(method: RecoveryMethod, now: number, cfg: MachineConfig): MachineResult {
  return method === "code_liveness"
    ? { state: "pending_liveness", cooldownUntil: null, updatedAt: now }
    : { state: "cooling_down", cooldownUntil: now + cooldownMs(method, cfg), updatedAt: now };
}

/**
 * Time-based edges. A request in `cooling_down` is waiting on the clock, not the user, so it
 * never idles out; it becomes `ready` at `cooldownUntil` and its idle clock starts then.
 */
export function settle(req: MachineRequest, now: number, cfg: MachineConfig): MachineResult {
  let { state, updatedAt } = req;
  const { cooldownUntil } = req;
  if (state === "cooling_down" && cooldownUntil !== null && now >= cooldownUntil) {
    state = "ready";
    updatedAt = cooldownUntil;
  }
  if ((state === "pending_liveness" || state === "ready") && now - updatedAt >= cfg.idleExpiryMs) {
    updatedAt = updatedAt + cfg.idleExpiryMs;
    state = "expired";
  }
  return { state, cooldownUntil, updatedAt };
}

export function transition(
  req: MachineRequest,
  event: RecoveryEvent,
  now: number,
  cfg: MachineConfig,
): TransitionResult {
  const s = settle(req, now, cfg);
  const illegal = { error: "RECOVERY_STATE" } as const;
  switch (event.type) {
    case "tick":
      return s;
    case "liveness_pass":
      if (s.state !== "pending_liveness") return illegal;
      return { state: "cooling_down", cooldownUntil: now + cooldownMs(req.method, cfg), updatedAt: now };
    case "liveness_fail_final":
      if (s.state !== "pending_liveness") return illegal;
      return { state: "cancelled", cooldownUntil: s.cooldownUntil, updatedAt: now };
    case "complete":
      if (s.state !== "ready") return illegal;
      return { state: "completed", cooldownUntil: s.cooldownUntil, updatedAt: now };
    case "cancel":
      if (!isOpen(s.state)) return illegal;
      return { state: "cancelled", cooldownUntil: s.cooldownUntil, updatedAt: now, cancelledBy: event.by };
  }
}
