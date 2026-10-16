// Full schema per docs/data-model.md. FROZEN for agents: request changes in your
// handoff doc instead of editing (see docs/agents/workflow.md).
import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at").notNull().$defaultFn(() => Date.now());

export const users = sqliteTable("users", {
  id: id(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  webauthnUserId: text("webauthn_user_id").notNull().unique(), // base64url of 32 random bytes
  faceTemplateEnc: text("face_template_enc"), // opaque base64 blob from bio, null = not enrolled
  createdAt: createdAt(),
});

export const credentials = sqliteTable(
  "credentials",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    credentialId: text("credential_id").notNull().unique(), // base64url
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    signCount: integer("sign_count").notNull().default(0),
    transports: text("transports", { mode: "json" }).$type<string[]>().notNull().default([]),
    label: text("label").notNull(),
    lastUsedAt: integer("last_used_at"),
    lastUsedUa: text("last_used_ua"),
    revokedAt: integer("revoked_at"),
    revokedReason: text("revoked_reason", {
      enum: ["user", "lost", "admin", "recovery", "clone_detected"],
    }),
    createdAt: createdAt(),
  },
  (t) => [index("credentials_user_idx").on(t.userId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id),
    credentialId: text("credential_id").references(() => credentials.id), // credentials.id (row id)
    stepUpPending: integer("step_up_pending", { mode: "boolean" }).notNull().default(false),
    reauthAt: integer("reauth_at"),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const challengePurposes = [
  "register",
  "login",
  "reauth",
  "add_key",
  "link_approve",
  "link_register",
  "recovery_register",
  "stepup_liveness",
  "recovery_liveness",
  "oauth_code", // "Sign in with Secure": one-time authorization code for a client app
  "oauth_liveness", // liveness check a client app asked for (targetId = sessionId)
  "oauth_liveness_pass", // short-lived marker that oauth_liveness passed (targetId = sessionId)
] as const;
export type ChallengePurpose = (typeof challengePurposes)[number];

export const challenges = sqliteTable("challenges", {
  id: id(),
  purpose: text("purpose", { enum: challengePurposes }).notNull(),
  challenge: text("challenge").notNull(), // WebAuthn challenge (base64url) or JSON prompt list
  userId: text("user_id"),
  targetId: text("target_id"), // linkId / recoveryId / sessionId the ceremony is bound to
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>(), // e.g. pending sign-up {handle, displayName, webauthnUserId}
  attemptsLeft: integer("attempts_left"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: createdAt(),
});

export const recoveryCodes = sqliteTable("recovery_codes", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull(),
  usedAt: integer("used_at"),
  supersededAt: integer("superseded_at"),
  createdAt: createdAt(),
});

export const recoveryStates = [
  "pending_liveness",
  "cooling_down",
  "ready",
  "completed",
  "cancelled",
  "expired",
] as const;
export type RecoveryState = (typeof recoveryStates)[number];

export const recoveryRequests = sqliteTable(
  "recovery_requests",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    method: text("method", { enum: ["code_liveness", "code_only"] }).notNull(),
    state: text("state", { enum: recoveryStates }).notNull(),
    cooldownUntil: integer("cooldown_until"),
    bindingHash: text("binding_hash").notNull(),
    cancelledBy: text("cancelled_by", { enum: ["user", "admin"] }),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
    createdAt: createdAt(),
  },
  (t) => [index("recovery_user_idx").on(t.userId)],
);

export const deviceLinks = sqliteTable("device_links", {
  id: id(),
  shortCode: text("short_code").notNull(),
  nonce: text("nonce").notNull(),
  bindingHash: text("binding_hash").notNull(),
  requesterUa: text("requester_ua"),
  status: text("status", { enum: ["pending", "approved", "denied", "consumed"] }).notNull(),
  userId: text("user_id").references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: createdAt(),
});

export const authEventTypes = [
  "register",
  "login_success",
  "login_fail",
  "step_up_required",
  "step_up_pass",
  "step_up_fail",
  "blocked",
  "logout",
  "reauth",
  "bio_enrolled",
  "bio_deleted",
  "device_linked",
  "credential_added",
  "credential_revoked",
  "recovery_code_generated",
  "recovery_started",
  "recovery_liveness_pass",
  "recovery_liveness_fail",
  "recovery_cancelled",
  "recovery_completed",
  "clone_detected",
  "admin_action",
  "app_authorized", // a client app received this user's identity ("Sign in with Secure")
] as const;
export type AuthEventType = (typeof authEventTypes)[number];

// Append-only. Never update or delete rows (AGENTS.md rule 8).
export const authEvents = sqliteTable(
  "auth_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id"),
    credentialId: text("credential_id"),
    type: text("type", { enum: authEventTypes }).notNull(),
    ip: text("ip"),
    ua: text("ua"),
    country: text("country"),
    riskScore: integer("risk_score"),
    riskSignals: text("risk_signals", { mode: "json" }).$type<string[]>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("events_user_idx").on(t.userId), index("events_type_idx").on(t.type)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    text: text("text").notNull(),
    readAt: integer("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Credential = typeof credentials.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type RecoveryRequest = typeof recoveryRequests.$inferSelect;
export type DeviceLink = typeof deviceLinks.$inferSelect;
export type AuthEvent = typeof authEvents.$inferSelect;
