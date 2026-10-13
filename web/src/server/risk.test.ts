import { describe, expect, it } from "vitest";
import {
  RECENT_FAILURES_COUNT,
  RISK_BLOCK_MIN,
  RISK_STEP_UP_MIN,
  RISK_WEIGHTS,
} from "@/server/config";
import { decide, risk, topReason, type RiskInput } from "@/server/risk";

const base: RiskInput = {
  country: "IN",
  uaFamily: "Chrome|Linux",
  previousUaFamily: "Chrome|Linux",
  knownCountries: ["IN"],
  recentFailures: 0,
};

describe("risk", () => {
  it("first login after sign-up scores 0", () => {
    expect(risk({ ...base, knownCountries: [], previousUaFamily: "Chrome|Linux" })).toEqual({
      score: 0,
      signals: [],
      decision: "allow",
    });
  });

  it("first login with no history at all scores 0", () => {
    const r = risk({ ...base, knownCountries: [], previousUaFamily: null, country: "US" });
    expect(r.score).toBe(0);
    expect(r.decision).toBe("allow");
  });

  it("known country, same UA, no failures: allow", () => {
    expect(risk(base).decision).toBe("allow");
  });

  it("new_country fires for an unseen country", () => {
    const r = risk({ ...base, country: "US" });
    expect(r.signals).toEqual(["new_country"]);
    expect(r.score).toBe(RISK_WEIGHTS.new_country);
    expect(r.decision).toBe("step_up");
  });

  it("unknown country skips new_country", () => {
    const r = risk({ ...base, country: null });
    expect(r.signals).not.toContain("new_country");
    expect(r.score).toBe(0);
  });

  it("ua_change fires when the browser/OS family differs", () => {
    const r = risk({ ...base, uaFamily: "Firefox|Windows" });
    expect(r.signals).toEqual(["ua_change"]);
    expect(r.score).toBe(RISK_WEIGHTS.ua_change);
    expect(r.decision).toBe("allow");
  });

  it("no previous UA skips ua_change", () => {
    expect(risk({ ...base, previousUaFamily: null, uaFamily: "Safari|iOS" }).signals).toEqual([]);
  });

  it("recent_failures fires at exactly the threshold, not below", () => {
    expect(risk({ ...base, recentFailures: RECENT_FAILURES_COUNT - 1 }).signals).toEqual([]);
    const r = risk({ ...base, recentFailures: RECENT_FAILURES_COUNT });
    expect(r.signals).toEqual(["recent_failures"]);
    expect(r.score).toBe(RISK_WEIGHTS.recent_failures);
  });

  it("new country + new device: step_up", () => {
    const r = risk({ ...base, country: "US", uaFamily: "Safari|macOS" });
    expect(r.score).toBe(RISK_WEIGHTS.new_country + RISK_WEIGHTS.ua_change);
    expect(r.decision).toBe("step_up");
  });

  it("all signals: block", () => {
    const r = risk({
      ...base,
      country: "US",
      uaFamily: "Safari|macOS",
      recentFailures: RECENT_FAILURES_COUNT,
    });
    expect(r.signals).toEqual(["new_country", "ua_change", "recent_failures"]);
    expect(r.score).toBe(80);
    expect(r.decision).toBe("block");
  });
});

describe("decide thresholds", () => {
  it("edges", () => {
    expect(decide(0)).toBe("allow");
    expect(decide(RISK_STEP_UP_MIN - 1)).toBe("allow");
    expect(decide(RISK_STEP_UP_MIN)).toBe("step_up");
    expect(decide(RISK_BLOCK_MIN - 1)).toBe("step_up");
    expect(decide(RISK_BLOCK_MIN)).toBe("block");
    expect(decide(200)).toBe("block");
  });
});

describe("topReason", () => {
  it("picks the heaviest signal", () => {
    expect(topReason(["ua_change", "new_country"])).toBe("new_location");
    expect(topReason(["recent_failures"])).toBe("recent_failures");
    expect(topReason([])).toBe("unusual_sign_in");
  });
});
