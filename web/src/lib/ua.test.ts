import { describe, expect, it } from "vitest";
import { labelFromUA, uaFamily } from "./ua";

const chromeAndroid =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("ua", () => {
  it("labels a known UA", () => {
    expect(labelFromUA(chromeAndroid)).toMatch(/Chrome.* on Android/);
  });
  it("handles missing UA", () => {
    expect(labelFromUA(null)).toBe("Unknown device");
    expect(uaFamily(undefined)).toBe("unknown");
  });
});
