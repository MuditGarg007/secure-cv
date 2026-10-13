"use client";
import { MapPin } from "lucide-react";
import { DEBUG_COUNTRIES, setDebugCountry, useDebugCountry } from "@/components/auth/debug-country";

/** Hidden demo control (DEBUG_RISK=1 only): pick the country the server should see. */
export function SimulateLocation() {
  const country = useDebugCountry();
  return (
    <details className="text-muted-foreground mt-6 text-sm">
      <summary className="cursor-pointer select-none">Demo: simulate location</summary>
      <label className="mt-2 flex items-center gap-2">
        <MapPin className="size-4" />
        <span>Signing in from</span>
        <select
          className="border-input bg-background h-9 rounded-md border px-2"
          value={country}
          onChange={(e) => setDebugCountry(e.target.value)}
        >
          {DEBUG_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </details>
  );
}
