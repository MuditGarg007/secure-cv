"use client";
import { useSyncExternalStore } from "react";

// Demo-only "Simulate location" (docs/auth.md#risk-check). The chosen country lives in
// localStorage and is sent as X-Debug-Country; the server only honours it when DEBUG_RISK=1.
// Defaults to the home country so sign-up and the first sign-in share a baseline location.

const KEY = "debugCountry";
const EVENT = "debug-country-change";
export const HOME_COUNTRY = "IN";
export const DEBUG_COUNTRIES = [
  { code: "IN", name: "India (home)" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "UAE" },
  { code: "DE", name: "Germany" },
  { code: "BR", name: "Brazil" },
  { code: "NG", name: "Nigeria" },
] as const;

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? HOME_COUNTRY;
  } catch {
    return HOME_COUNTRY;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function setDebugCountry(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Current simulated country (always HOME_COUNTRY during SSR). */
export function useDebugCountry(): string {
  return useSyncExternalStore(subscribe, read, () => HOME_COUNTRY);
}

/** Headers for passkey calls: X-Debug-Country only when the demo toggle is enabled. */
export function debugHeaders(enabled: boolean, country: string): Record<string, string> | undefined {
  return enabled ? { "X-Debug-Country": country } : undefined;
}

const noopSubscribe = () => () => {};

/** False during SSR and the hydration render, true after (client snapshot is real). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
