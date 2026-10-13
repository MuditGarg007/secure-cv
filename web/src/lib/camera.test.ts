import { describe, expect, it } from "vitest";
import { CAPTURE_FPS, LIVENESS_CAPTURE_WINDOW_MS, MAX_LIVENESS_FRAMES } from "@/server/config";
import { buildFrameForm, captureSchedule, FRAME_FIELD_RE, fitSize, frameFieldName, relativeTimestamps } from "./camera";

describe("frameFieldName", () => {
  it("zero-pads to three digits", () => {
    expect(frameFieldName(0)).toBe("frame_000");
    expect(frameFieldName(7)).toBe("frame_007");
    expect(frameFieldName(79)).toBe("frame_079");
    expect(FRAME_FIELD_RE.test(frameFieldName(42))).toBe(true);
    expect(FRAME_FIELD_RE.test("frame_42")).toBe(false);
  });
});

describe("captureSchedule", () => {
  it("covers the liveness window at 10 fps within the frame cap", () => {
    const s = captureSchedule(CAPTURE_FPS, LIVENESS_CAPTURE_WINDOW_MS, MAX_LIVENESS_FRAMES);
    expect(s).toHaveLength(80);
    expect(s[0]).toBe(0);
    expect(s[1]).toBe(100);
    expect(s.at(-1)).toBe(7900);
    expect(s.length).toBeLessThanOrEqual(MAX_LIVENESS_FRAMES);
  });

  it("stops at maxFrames", () => {
    expect(captureSchedule(10, 60_000, 5)).toEqual([0, 100, 200, 300, 400]);
  });

  it("is strictly increasing", () => {
    const s = captureSchedule(30, 1000, 100);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });
});

describe("relativeTimestamps", () => {
  it("is relative to the first frame and rounded", () => {
    expect(relativeTimestamps([1000.4, 1100.6, 1199.9])).toEqual([0, 100, 200]);
  });

  it("keeps timestamps strictly increasing even when rounding collides", () => {
    expect(relativeTimestamps([10, 10.2, 10.4, 50])).toEqual([0, 1, 2, 40]);
  });

  it("handles empty input", () => {
    expect(relativeTimestamps([])).toEqual([]);
  });
});

describe("fitSize", () => {
  it("keeps 640x480 and downscales larger frames", () => {
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitSize(1280, 720)).toEqual({ width: 640, height: 360 });
    expect(fitSize(320, 240)).toEqual({ width: 320, height: 240 });
  });
});

describe("buildFrameForm", () => {
  it("puts meta first and frames in order", async () => {
    const frames = [new Blob(["a"], { type: "image/jpeg" }), new Blob(["b"], { type: "image/jpeg" })];
    const form = buildFrameForm({ challengeId: "c", timestamps: [0, 100] }, frames);
    expect([...form.keys()]).toEqual(["meta", "frame_000", "frame_001"]);
    expect(JSON.parse(form.get("meta") as string)).toEqual({ challengeId: "c", timestamps: [0, 100] });
    const f1 = form.get("frame_001") as File;
    expect(f1.name).toBe("frame_001.jpg");
    expect(await f1.text()).toBe("b");
  });
});
