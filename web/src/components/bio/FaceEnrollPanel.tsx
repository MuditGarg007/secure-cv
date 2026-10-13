"use client";
// CONTRACT STUB, owned by agent B (bio). Props are FROZEN; B replaces the body.
// Used by agent A in /signup step 3 and inside FaceSettings.
import { Button } from "@/components/ui/button";

export type FaceEnrollPanelProps = {
  /** Called after a successful enrollment (true) or when the user skips (false). */
  onDone: (enrolled: boolean) => void;
  /** Show a "Skip" button with the skip warning from docs/flows.md. */
  allowSkip?: boolean;
};

export function FaceEnrollPanel({ onDone, allowSkip }: FaceEnrollPanelProps) {
  return (
    <div className="rounded-lg border p-4 text-sm">
      <p>Face enrollment is not built yet.</p>
      {allowSkip && (
        <Button className="mt-3" variant="outline" onClick={() => onDone(false)}>
          Skip for now
        </Button>
      )}
    </div>
  );
}
