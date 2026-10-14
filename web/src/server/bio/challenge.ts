import { randomInt } from "node:crypto";
import { CANNED_PROMPT_COUNT, CUSTOM_GESTURE, GESTURES } from "@/server/config";

// Pure liveness prompt generator (docs/biometrics.md#gesture-prompts). No db/env imports: unit tested.

export type Gesture = (typeof GESTURES)[number];
/** A canned MediaPipe gesture, or the user's own enrolled hand shape. */
export type Prompt = Gesture | typeof CUSTOM_GESTURE;

/**
 * The user's custom gesture plus `canned` random canned gestures (no two consecutive alike), with
 * the custom one at a random position: 2 x 7 = 14 sequences for one canned prompt. The random part
 * is what a replayed recording of the custom gesture can't contain.
 * `rand(n)` must return a uniform integer in [0, n); defaults to crypto randomness.
 */
export function generatePrompts(canned: number = CANNED_PROMPT_COUNT, rand: (n: number) => number = randomInt): Prompt[] {
  const out: Gesture[] = [];
  for (let i = 0; i < canned; i++) {
    const pool = i === 0 ? GESTURES : GESTURES.filter((g) => g !== out[i - 1]);
    out.push(pool[rand(pool.length)]);
  }
  const at = rand(canned + 1);
  return [...out.slice(0, at), CUSTOM_GESTURE, ...out.slice(at)];
}

function isPrompt(v: unknown): v is Prompt {
  return v === CUSTOM_GESTURE || (GESTURES as readonly unknown[]).includes(v);
}

/** Parse the prompt list stored in `challenges.challenge`: known prompts, exactly one custom. Null if invalid. */
export function parsePrompts(stored: string): Prompt[] | null {
  try {
    const v: unknown = JSON.parse(stored);
    if (Array.isArray(v) && v.every(isPrompt) && v.filter((p) => p === CUSTOM_GESTURE).length === 1) {
      return v;
    }
  } catch {
    // fall through
  }
  return null;
}
