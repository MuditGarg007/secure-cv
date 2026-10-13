import "server-only";
import { z } from "zod";

// Validated env. Fails fast on first import if something is missing.
const schema = z.object({
  RP_ID: z.string().min(1),
  RP_NAME: z.string().min(1),
  ORIGIN: z.url(),
  BIO_URL: z.url(),
  BIO_INTERNAL_TOKEN: z.string().min(8),
  ADMIN_HANDLES: z.string().default(""),
  DEBUG_RISK: z.enum(["0", "1"]).default("0"),
  RECOVERY_COOLDOWN_OVERRIDE_S: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().int().positive().optional(),
  ),
});

export const env = schema.parse(process.env);

export const adminHandles = new Set(
  env.ADMIN_HANDLES.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

export const isHttps = env.ORIGIN.startsWith("https://");
