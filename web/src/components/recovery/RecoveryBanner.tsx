// CONTRACT, owned by agent D (recovery). Props are FROZEN.
// Server component. Agent A renders it at the top of /home. Shows an open recovery
// request for this user with a Cancel button, or nothing.
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceButton } from "@/components/common/VoiceButton";
import { openRecoveryRequest } from "@/server/recovery/service";
import { CancelRecoveryButton } from "./CancelRecoveryButton";
import { LocalTime } from "./LocalTime";

export type RecoveryBannerProps = { userId: string };

const VOICE =
  "Someone started recovering your account. If this was not you, press Cancel this recovery now.";

export async function RecoveryBanner({ userId }: RecoveryBannerProps) {
  const req = openRecoveryRequest(userId);
  if (!req) return null;
  return (
    <Alert variant="destructive" className="gap-2 p-4">
      <ShieldAlert />
      <AlertTitle className="text-base">Account recovery in progress</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          Someone started recovering your account on <LocalTime ms={req.createdAt} />.
          {req.state === "pending_liveness" && " They still have to pass the face check."}
          {req.state === "cooling_down" && req.cooldownUntil && (
            <>
              {" "}
              They can replace your passkeys after <LocalTime ms={req.cooldownUntil} />.
            </>
          )}
          {req.state === "ready" && " They can replace your passkeys now."}
        </p>
        <p className="font-medium">Not you? Cancel it now. Your passkeys keep working.</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <CancelRecoveryButton recoveryId={req.id} />
          </div>
          <VoiceButton text={VOICE} />
        </div>
      </AlertDescription>
    </Alert>
  );
}
