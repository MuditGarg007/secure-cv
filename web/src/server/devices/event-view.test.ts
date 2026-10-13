import { describe, expect, it } from "vitest";
import { authEventTypes } from "@/server/db/schema";
import { parseEventType, viewEvent } from "./event-view";

describe("viewEvent", () => {
  it("maps tones to icons", () => {
    expect(viewEvent({ type: "login_success", metadata: null }).icon).toBe("✓");
    expect(viewEvent({ type: "step_up_required", metadata: null }).icon).toBe("⚠");
    expect(viewEvent({ type: "blocked", metadata: null }).icon).toBe("⛔");
    expect(viewEvent({ type: "credential_revoked", metadata: null }).icon).toBe("🔑");
  });
  it("covers every event type", () => {
    for (const type of authEventTypes) {
      const v = viewEvent({ type, metadata: null });
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.icon.length).toBeGreaterThan(0);
    }
  });
  it("flags origin mismatch as phishing", () => {
    const v = viewEvent({ type: "login_fail", metadata: { reason: "origin_mismatch" } });
    expect(v.phishing).toBe(true);
    expect(v.tone).toBe("blocked");
    expect(viewEvent({ type: "login_fail", metadata: { reason: "x" } }).phishing).toBe(false);
  });
  it("labels device link stages", () => {
    expect(viewEvent({ type: "device_linked", metadata: { stage: "denied" } }).label).toBe("New device denied");
    expect(viewEvent({ type: "device_linked", metadata: { stage: "??" } }).label).toBe("Device link");
  });
});

describe("parseEventType", () => {
  it("accepts known types only", () => {
    expect(parseEventType("login_fail", authEventTypes)).toBe("login_fail");
    expect(parseEventType("nope", authEventTypes)).toBeNull();
    expect(parseEventType(["login_fail"], authEventTypes)).toBeNull();
  });
});
