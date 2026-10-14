import { describe, expect, it } from "vitest";
import { CANNED_PROMPT_COUNT, CUSTOM_GESTURE, GESTURES } from "@/server/config";
import { generatePrompts, parsePrompts } from "./challenge";

describe("generatePrompts", () => {
  it("returns the custom gesture plus CANNED_PROMPT_COUNT known gestures", () => {
    const p = generatePrompts();
    expect(p).toHaveLength(CANNED_PROMPT_COUNT + 1);
    expect(p.filter((g) => g === CUSTOM_GESTURE)).toHaveLength(1);
    for (const g of p.filter((g) => g !== CUSTOM_GESTURE)) expect(GESTURES).toContain(g);
  });

  it("never repeats a canned gesture back to back", () => {
    for (let i = 0; i < 2000; i++) {
      const p = generatePrompts(6).filter((g) => g !== CUSTOM_GESTURE);
      for (let k = 1; k < p.length; k++) expect(p[k]).not.toBe(p[k - 1]);
    }
  });

  it("can produce all 14 one-canned sequences", () => {
    // Enumerate every rand() path: 7 canned choices, then 2 positions for the custom gesture.
    const seen = new Set<string>();
    for (let a = 0; a < 7; a++)
      for (let b = 0; b < 2; b++) {
        const picks = [a, b];
        seen.add(generatePrompts(1, () => picks.shift()!).join(","));
      }
    expect(seen.size).toBe(14);
  });

  it("uses the pool sizes it is given", () => {
    const sizes: number[] = [];
    generatePrompts(2, (n) => (sizes.push(n), 0));
    expect(sizes).toEqual([7, 6, 3]); // canned, canned (excluding previous), custom position
  });

  it("puts the custom gesture in both positions", () => {
    const firsts = new Set(Array.from({ length: 200 }, () => generatePrompts()[0] === CUSTOM_GESTURE));
    expect(firsts).toEqual(new Set([true, false]));
  });
});

describe("parsePrompts", () => {
  it("round-trips a stored list", () => {
    const p = generatePrompts();
    expect(parsePrompts(JSON.stringify(p))).toEqual(p);
  });

  it.each([
    "",
    "not json",
    "[]",
    '["Wave","Custom"]',
    '["Victory"]', // no custom gesture
    '["Custom","Custom"]', // custom twice
    '{"a":1}',
    '"Custom"',
  ])("rejects %j", (s) => {
    expect(parsePrompts(s)).toBeNull();
  });
});
