import { randomInt } from "node:crypto";
import { GESTURES, PROMPT_COUNT } from "@/server/config";

// Pure liveness prompt generator (docs/biometrics.md#gesture-prompts). No db/env imports: unit tested.

export type Gesture = (typeof GESTURES)[number];

/**
 * `count` random gestures, no two consecutive alike: 7 x 6 x 6 = 252 sequences for 3 prompts.
 * `rand(n)` must return a uniform integer in [0, n); defaults to crypto randomness.
 */
export function generatePrompts(count: number = PROMPT_COUNT, rand: (n: number) => number = randomInt): Gesture[] {
  const out: Gesture[] = [];
  for (let i = 0; i < count; i++) {
    const pool = i === 0 ? GESTURES : GESTURES.filter((g) => g !== out[i - 1]);
    out.push(pool[rand(pool.length)]);
  }
  return out;
}

/** Parse the prompt list stored in `challenges.challenge`. Null if it isn't a valid list. */
export function parsePrompts(stored: string): Gesture[] | null {
  try {
    const v: unknown = JSON.parse(stored);
    if (Array.isArray(v) && v.length > 0 && v.every((g) => (GESTURES as readonly unknown[]).includes(g))) {
      return v as Gesture[];
    }
  } catch {
    // fall through
  }
  return null;
}
