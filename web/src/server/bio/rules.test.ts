import { describe, expect, it } from "vitest";
import {
  carriedAttempts,
  countryLabel,
  enrollHint,
  enrollStep,
  hintFromReasons,
  stepUpReasonText,
  validTimestamps,
} from "./rules";

describe("hintFromReasons", () => {
  it.each([
    [["no_face"], "face_not_visible"],
    [["multiple_faces"], "face_not_visible"],
    [["prompt_missing"], "gesture_not_seen"],
    [["timing"], "too_slow"],
    [["face_mismatch"], "try_again"],
    [["discontinuity"], "try_again"],
    [["template_invalid"], "try_again"],
    [["gesture_mismatch"], "try_again"],
    [[], "try_again"],
    [["something_new"], "try_again"],
  ])("%j -> %s", (reasons, hint) => {
    expect(hintFromReasons(reasons)).toBe(hint);
  });

  it("never reveals a face mismatch behind a more specific hint", () => {
    expect(hintFromReasons(["prompt_missing", "face_mismatch"])).toBe("try_again");
    expect(hintFromReasons(["no_face", "discontinuity", "timing"])).toBe("try_again");
  });

  it("never reveals that a shown hand shape was the wrong custom gesture", () => {
    expect(hintFromReasons(["gesture_mismatch", "no_face"])).toBe("try_again");
    expect(hintFromReasons(["gesture_mismatch", "timing"])).toBe("try_again");
  });

  it("prefers too_slow over visibility and gestures", () => {
    expect(hintFromReasons(["no_face", "prompt_missing", "timing"])).toBe("too_slow");
    expect(hintFromReasons(["no_face", "prompt_missing"])).toBe("face_not_visible");
  });
});

describe("enrollHint", () => {
  it("passes known reasons through and maps the rest to low_quality", () => {
    expect(enrollHint("no_face")).toBe("no_face");
    expect(enrollHint("multiple_faces")).toBe("multiple_faces");
    expect(enrollHint("low_quality")).toBe("low_quality");
    expect(enrollHint("weird")).toBe("low_quality");
    expect(enrollHint(undefined)).toBe("low_quality");
    expect(enrollHint("no_hand")).toBe("no_hand");
    expect(enrollHint("multiple_hands")).toBe("multiple_hands");
    expect(enrollHint("gesture_unstable")).toBe("gesture_unstable");
  });
});

describe("enrollStep", () => {
  it("sends gesture problems back to the gesture step and the rest to the face step", () => {
    expect(enrollStep("gesture_unstable")).toBe("gesture");
    expect(enrollStep("no_hand")).toBe("gesture");
    expect(enrollStep("multiple_hands")).toBe("gesture");
    expect(enrollStep("no_face")).toBe("face");
    expect(enrollStep("low_quality")).toBe("face");
  });
});

describe("validTimestamps", () => {
  it("accepts increasing timestamps from 0, one per frame", () => {
    expect(validTimestamps([0, 100, 199, 300], 4)).toBe(true);
  });

  it.each([
    [[0, 100], 3, "count mismatch"],
    [[0, 100, 100], 3, "repeated"],
    [[0, 200, 100], 3, "decreasing"],
    [[-1, 100], 2, "negative"],
    [[0, Number.NaN], 2, "NaN"],
    [[0, Number.POSITIVE_INFINITY], 2, "infinite"],
  ])("rejects %j for %d frames (%s)", (ts, n) => {
    expect(validTimestamps(ts, n)).toBe(false);
  });
});

describe("carriedAttempts", () => {
  it("starts at max when there is no earlier challenge", () => {
    expect(carriedAttempts([], 3)).toBe(3);
    expect(carriedAttempts([null], 3)).toBe(3);
  });

  it("keeps the lowest remaining count, so new prompts don't reset attempts", () => {
    expect(carriedAttempts([2], 3)).toBe(2);
    expect(carriedAttempts([3, 1, 2], 3)).toBe(1);
    expect(carriedAttempts([0], 3)).toBe(0);
  });

  it("never exceeds max", () => {
    expect(carriedAttempts([9], 3)).toBe(3);
  });
});

describe("stepUpReasonText", () => {
  it("names only the category", () => {
    expect(stepUpReasonText(["new_country", "ua_change"])).toBe("new location");
    expect(stepUpReasonText(["ua_change"])).toBe("new device or browser");
    expect(stepUpReasonText(["recent_failures"])).toBe("several failed sign-ins");
    expect(stepUpReasonText([])).toBe("unusual activity");
    expect(stepUpReasonText(null)).toBe("unusual activity");
  });
});

describe("countryLabel", () => {
  it("names a country code", () => {
    expect(countryLabel("IN")).toBe("India");
    expect(countryLabel("de")).toBe("Germany");
  });

  it("falls back when unknown", () => {
    expect(countryLabel(null)).toBe("a new location");
    expect(countryLabel("")).toBe("a new location");
  });
});
