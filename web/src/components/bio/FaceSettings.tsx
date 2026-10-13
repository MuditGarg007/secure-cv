"use client";
// CONTRACT STUB, owned by agent B (bio). Props are FROZEN; B replaces the body.
// Used by agent A on /security: enroll / re-enroll / delete face (reauth via withReauth).

export type FaceSettingsProps = { enrolled: boolean };

export function FaceSettings({ enrolled }: FaceSettingsProps) {
  return (
    <div className="rounded-lg border p-4 text-sm">
      Face check: {enrolled ? "set up" : "not set up"} (settings coming soon)
    </div>
  );
}
