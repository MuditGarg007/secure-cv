import { describe, expect, it } from "vitest";
import {
  cooldownMs,
  isOpen,
  settle,
  startState,
  transition,
  type MachineConfig,
  type MachineRequest,
  type RecoveryEvent,
  type RecoveryState,
} from "./machine";

const H = 60 * 60 * 1000;
const cfg: MachineConfig = { cooldownCodeLivenessMs: 24 * H, cooldownCodeOnlyMs: 72 * H, idleExpiryMs: 48 * H };
const T0 = 1_000_000_000_000;

function req(state: RecoveryState, over: Partial<MachineRequest> = {}): MachineRequest {
  return { state, method: "code_liveness", cooldownUntil: null, updatedAt: T0, ...over };
}

describe("start", () => {
  it("face enrolled → pending_liveness, no cooldown yet", () => {
    expect(startState("code_liveness", T0, cfg)).toEqual({
      state: "pending_liveness",
      cooldownUntil: null,
      updatedAt: T0,
    });
  });
  it("no face → cooling_down for 72 h", () => {
    expect(startState("code_only", T0, cfg)).toEqual({
      state: "cooling_down",
      cooldownUntil: T0 + 72 * H,
      updatedAt: T0,
    });
  });
  it("override replaces both cooldowns", () => {
    const o = { ...cfg, cooldownOverrideMs: 60_000 };
    expect(cooldownMs("code_only", o)).toBe(60_000);
    expect(cooldownMs("code_liveness", o)).toBe(60_000);
    expect(startState("code_only", T0, o).cooldownUntil).toBe(T0 + 60_000);
  });
});

describe("edges", () => {
  it("pending_liveness ─pass→ cooling_down (24 h)", () => {
    const now = T0 + 5_000;
    expect(transition(req("pending_liveness"), { type: "liveness_pass" }, now, cfg)).toEqual({
      state: "cooling_down",
      cooldownUntil: now + 24 * H,
      updatedAt: now,
    });
  });

  it("pending_liveness ─3 fails→ cancelled", () => {
    const r = transition(req("pending_liveness"), { type: "liveness_fail_final" }, T0 + 1, cfg);
    expect(r).toMatchObject({ state: "cancelled", updatedAt: T0 + 1 });
    expect(r).not.toHaveProperty("cancelledBy");
  });

  it("cooling_down stays until cooldown ends", () => {
    const r = req("cooling_down", { cooldownUntil: T0 + H });
    expect(transition(r, { type: "tick" }, T0 + H - 1, cfg)).toMatchObject({ state: "cooling_down" });
  });

  it("cooling_down ─time passes→ ready (lazy), idle clock starts at cooldownUntil", () => {
    const r = req("cooling_down", { cooldownUntil: T0 + H });
    expect(transition(r, { type: "tick" }, T0 + H, cfg)).toEqual({
      state: "ready",
      cooldownUntil: T0 + H,
      updatedAt: T0 + H,
    });
  });

  it("cooling_down never idles out, even when the cooldown is longer than 48 h", () => {
    const r = req("cooling_down", { method: "code_only", cooldownUntil: T0 + 72 * H });
    expect(settle(r, T0 + 71 * H, cfg).state).toBe("cooling_down");
  });

  it("ready ─new passkey→ completed", () => {
    expect(transition(req("ready"), { type: "complete" }, T0 + 1, cfg)).toMatchObject({
      state: "completed",
      updatedAt: T0 + 1,
    });
  });

  it("complete works straight from cooling_down once the cooldown is over (lazy)", () => {
    const r = req("cooling_down", { cooldownUntil: T0 + H });
    expect(transition(r, { type: "complete" }, T0 + H + 1, cfg)).toMatchObject({ state: "completed" });
  });

  for (const state of ["pending_liveness", "cooling_down", "ready"] as const) {
    it(`${state} ─cancel(user)→ cancelled`, () => {
      const r = req(state, { cooldownUntil: state === "pending_liveness" ? null : T0 + H });
      expect(transition(r, { type: "cancel", by: "user" }, T0 + 1, cfg)).toMatchObject({
        state: "cancelled",
        cancelledBy: "user",
        updatedAt: T0 + 1,
      });
    });
    it(`${state} ─cancel(admin)→ cancelled`, () => {
      const r = req(state, { cooldownUntil: state === "pending_liveness" ? null : T0 + H });
      expect(transition(r, { type: "cancel", by: "admin" }, T0 + 1, cfg)).toMatchObject({
        state: "cancelled",
        cancelledBy: "admin",
      });
    });
  }

  it("pending_liveness ─48 h idle→ expired", () => {
    expect(transition(req("pending_liveness"), { type: "tick" }, T0 + 48 * H - 1, cfg)).toMatchObject({
      state: "pending_liveness",
    });
    expect(transition(req("pending_liveness"), { type: "tick" }, T0 + 48 * H, cfg)).toEqual({
      state: "expired",
      cooldownUntil: null,
      updatedAt: T0 + 48 * H,
    });
  });

  it("ready ─48 h idle→ expired", () => {
    expect(transition(req("ready"), { type: "tick" }, T0 + 48 * H, cfg)).toMatchObject({ state: "expired" });
  });

  it("cooling_down → ready → expired in one lazy read 48 h after the cooldown ended", () => {
    const r = req("cooling_down", { cooldownUntil: T0 + H });
    expect(transition(r, { type: "tick" }, T0 + H + 48 * H - 1, cfg)).toMatchObject({ state: "ready" });
    expect(transition(r, { type: "tick" }, T0 + H + 48 * H, cfg)).toMatchObject({
      state: "expired",
      updatedAt: T0 + 49 * H,
    });
  });

  it("an idle-expired request can no longer be cancelled or completed", () => {
    const late = T0 + 48 * H;
    expect(transition(req("pending_liveness"), { type: "liveness_pass" }, late, cfg)).toEqual({
      error: "RECOVERY_STATE",
    });
    expect(transition(req("ready"), { type: "complete" }, late, cfg)).toEqual({ error: "RECOVERY_STATE" });
    expect(transition(req("ready"), { type: "cancel", by: "user" }, late, cfg)).toEqual({
      error: "RECOVERY_STATE",
    });
  });

  it("tick on a terminal state is a no-op", () => {
    for (const state of ["completed", "cancelled", "expired"] as const) {
      expect(transition(req(state), { type: "tick" }, T0 + 1000 * H, cfg)).toEqual({
        state,
        cooldownUntil: null,
        updatedAt: T0,
      });
    }
  });
});

describe("illegal events", () => {
  const events: RecoveryEvent[] = [
    { type: "liveness_pass" },
    { type: "liveness_fail_final" },
    { type: "complete" },
    { type: "cancel", by: "user" },
    { type: "cancel", by: "admin" },
  ];
  const legal: Record<RecoveryState, string[]> = {
    pending_liveness: ["liveness_pass", "liveness_fail_final", "cancel"],
    cooling_down: ["cancel"],
    ready: ["complete", "cancel"],
    completed: [],
    cancelled: [],
    expired: [],
  };
  // Shortly after T0: no time-based edge applies (cooldown still running).
  const now = T0 + 1000;
  for (const [state, allowed] of Object.entries(legal) as [RecoveryState, string[]][]) {
    for (const ev of events.filter((e) => !allowed.includes(e.type))) {
      it(`${state}: ${ev.type}${"by" in ev ? `(${ev.by})` : ""} → RECOVERY_STATE`, () => {
        const r = req(state, { cooldownUntil: state === "cooling_down" ? T0 + H : null });
        expect(transition(r, ev, now, cfg)).toEqual({ error: "RECOVERY_STATE" });
      });
    }
  }
});

describe("isOpen", () => {
  it("open = pending_liveness | cooling_down | ready", () => {
    expect(["pending_liveness", "cooling_down", "ready"].every((s) => isOpen(s as RecoveryState))).toBe(true);
    expect(["completed", "cancelled", "expired"].some((s) => isOpen(s as RecoveryState))).toBe(false);
  });
});
