// Pure risk check (docs/auth.md#risk-check). No db/env/next imports: data gathering lives in
// server/auth/login.ts. Runs after a valid login assertion, before any session is issued.
import {
  RECENT_FAILURES_COUNT,
  RISK_BLOCK_MIN,
  RISK_STEP_UP_MIN,
  RISK_WEIGHTS,
} from "@/server/config";

export type RiskSignal = keyof typeof RISK_WEIGHTS;
export type RiskDecision = "allow" | "step_up" | "block";

export type RiskInput = {
  /** ISO country of this request, null when unknown (signal skipped). */
  country: string | null;
  /** uaFamily() of this request. */
  uaFamily: string;
  /** uaFamily() of the credential's last_used_ua before this login, null if never recorded. */
  previousUaFamily: string | null;
  /** Countries of this user's past successful logins / step-up passes / registration. */
  knownCountries: string[];
  /** login_fail events for this user in the last RECENT_FAILURES_WINDOW_MS. */
  recentFailures: number;
};

export type RiskResult = { score: number; signals: RiskSignal[]; decision: RiskDecision };

/** Coarse, client-safe reason for a step-up (docs/api.md login/verify). */
export const SIGNAL_REASON: Record<RiskSignal, string> = {
  new_country: "new_location",
  ua_change: "new_device",
  recent_failures: "recent_failures",
};

export function decide(score: number): RiskDecision {
  if (score >= RISK_BLOCK_MIN) return "block";
  if (score >= RISK_STEP_UP_MIN) return "step_up";
  return "allow";
}

export function risk(input: RiskInput): RiskResult {
  const signals: RiskSignal[] = [];
  // Country: only comparable when we know it now AND have seen at least one before
  // (first login after sign-up scores 0).
  if (input.country && input.knownCountries.length > 0 && !input.knownCountries.includes(input.country)) {
    signals.push("new_country");
  }
  if (input.previousUaFamily !== null && input.previousUaFamily !== input.uaFamily) {
    signals.push("ua_change");
  }
  if (input.recentFailures >= RECENT_FAILURES_COUNT) signals.push("recent_failures");

  const score = signals.reduce((s, sig) => s + RISK_WEIGHTS[sig], 0);
  return { score, signals, decision: decide(score) };
}

/** Coarse reason from the heaviest signal, for {status:"step_up", reason}. */
export function topReason(signals: RiskSignal[]): string {
  const top = [...signals].sort((a, b) => RISK_WEIGHTS[b] - RISK_WEIGHTS[a])[0];
  return top ? SIGNAL_REASON[top] : "unusual_sign_in";
}
