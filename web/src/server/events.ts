import "server-only";
import { db, schema } from "@/server/db/client";
import type { AuthEventType } from "@/server/db/schema";
import { requestMeta, type RequestMeta } from "@/server/request-meta";

export type LogEventInput = {
  type: AuthEventType;
  userId?: string | null;
  credentialId?: string | null; // credentials.id (row id)
  riskScore?: number;
  riskSignals?: string[];
  /** Never put secrets, codes, tokens, frames or templates here. */
  metadata?: Record<string, unknown>;
  /** Override request-derived ip/ua/country (defaults to the current request). */
  meta?: RequestMeta;
};

/** Append an auth_events row. Insert-only: never update or delete (AGENTS.md rule 8). */
export async function logEvent(input: LogEventInput): Promise<void> {
  let meta = input.meta;
  if (!meta) {
    try {
      meta = await requestMeta();
    } catch {
      meta = { ip: null, ua: null, country: null }; // outside a request scope
    }
  }
  db.insert(schema.authEvents)
    .values({
      type: input.type,
      userId: input.userId ?? null,
      credentialId: input.credentialId ?? null,
      ip: meta.ip,
      ua: meta.ua,
      country: meta.country,
      riskScore: input.riskScore ?? null,
      riskSignals: input.riskSignals ?? null,
      metadata: input.metadata ?? null,
    })
    .run();
}
