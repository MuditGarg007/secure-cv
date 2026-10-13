import { describe, expect, it } from "vitest";
import { safeNext } from "@/server/auth/safe-next";

describe("safeNext", () => {
  it("accepts relative paths", () => {
    expect(safeNext("/home")).toBe("/home");
    expect(safeNext("/link/abc?n=x#frag")).toBe("/link/abc?n=x#frag");
  });
  it("rejects open redirects and junk", () => {
    for (const v of [
      undefined,
      ["/home"],
      "",
      "home",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      " /home",
      "/" + "a".repeat(600),
    ]) {
      expect(safeNext(v)).toBeNull();
    }
  });
});
