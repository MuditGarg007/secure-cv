import { describe, expect, it } from "vitest";
import { canApprove, canRegister, effectiveStatus, sameSecret } from "./link-state";

const now = 1_000_000;
const base = { status: "pending" as const, expiresAt: now + 1000, nonce: "abc123", userId: null };

describe("effectiveStatus", () => {
  it("open states expire", () => {
    expect(effectiveStatus(base, now)).toBe("pending");
    expect(effectiveStatus(base, now + 1000)).toBe("expired");
    expect(effectiveStatus({ ...base, status: "approved" }, now + 5000)).toBe("expired");
  });
  it("final states stay final", () => {
    expect(effectiveStatus({ ...base, status: "consumed" }, now + 5000)).toBe("consumed");
    expect(effectiveStatus({ ...base, status: "denied" }, now + 5000)).toBe("denied");
  });
});

describe("sameSecret", () => {
  it("compares", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcd")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});

describe("canApprove", () => {
  it("needs pending + matching nonce + not expired", () => {
    expect(canApprove(base, "abc123", now)).toBe(true);
    expect(canApprove(base, "wrong1", now)).toBe(false);
    expect(canApprove(base, "abc123", now + 1000)).toBe(false);
    expect(canApprove({ ...base, status: "approved" }, "abc123", now)).toBe(false);
    expect(canApprove({ ...base, status: "denied" }, "abc123", now)).toBe(false);
  });
});

describe("canRegister", () => {
  it("needs approved + user + not expired", () => {
    expect(canRegister({ ...base, status: "approved", userId: "u1" }, now)).toBe(true);
    expect(canRegister({ ...base, status: "approved", userId: null }, now)).toBe(false);
    expect(canRegister({ ...base, status: "approved", userId: "u1" }, now + 1000)).toBe(false);
    expect(canRegister({ ...base, status: "pending", userId: "u1" }, now)).toBe(false);
    expect(canRegister({ ...base, status: "consumed", userId: "u1" }, now)).toBe(false);
  });
});
