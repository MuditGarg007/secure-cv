import { describe, expect, it } from "vitest";
import { GESTURES, PROMPT_COUNT } from "@/server/config";
import { generatePrompts, parsePrompts } from "./challenge";

describe("generatePrompts", () => {
  it("returns PROMPT_COUNT known gestures", () => {
    const p = generatePrompts();
    expect(p).toHaveLength(PROMPT_COUNT);
    for (const g of p) expect(GESTURES).toContain(g);
  });

  it("never repeats a gesture back to back", () => {
    for (let i = 0; i < 2000; i++) {
      const p = generatePrompts(6);
      for (let k = 1; k < p.length; k++) expect(p[k]).not.toBe(p[k - 1]);
    }
  });

  it("can produce all 252 three-prompt sequences", () => {
    // Enumerate every rand() path: 7 choices, then 6, then 6.
    const seen = new Set<string>();
    for (let a = 0; a < 7; a++)
      for (let b = 0; b < 6; b++)
        for (let c = 0; c < 6; c++) {
          const picks = [a, b, c];
          seen.add(generatePrompts(3, () => picks.shift()!).join(","));
        }
    expect(seen.size).toBe(252);
  });

  it("uses the pool size it is given (excludes the previous gesture)", () => {
    const sizes: number[] = [];
    generatePrompts(3, (n) => (sizes.push(n), 0));
    expect(sizes).toEqual([7, 6, 6]);
  });

  it("is random by default", () => {
    const seqs = new Set(Array.from({ length: 50 }, () => generatePrompts().join(",")));
    expect(seqs.size).toBeGreaterThan(10);
  });
});

describe("parsePrompts", () => {
  it("round-trips a stored list", () => {
    const p = generatePrompts();
    expect(parsePrompts(JSON.stringify(p))).toEqual(p);
  });

  it.each(["", "not json", "[]", '["Wave"]', '{"a":1}', '"Victory"'])("rejects %j", (s) => {
    expect(parsePrompts(s)).toBeNull();
  });
});
