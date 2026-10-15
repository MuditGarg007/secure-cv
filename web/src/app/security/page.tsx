import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/common/PageShell";
import { FaceSettings } from "@/components/bio/FaceSettings";
import { NewRecoveryCode } from "@/components/auth/NewRecoveryCode";
import { hasFace } from "@/server/users";
import { requirePageSession } from "@/server/auth/sessions";
import { hasActiveRecoveryCode } from "@/server/auth/account";

export default async function SecurityPage() {
  const { user } = await requirePageSession({ next: "/security" });
  return (
    <PageShell
      eyebrow="Face check · Recovery"
      title="Security"
      voiceText="Security settings. Set up or change your face check, and make a new recovery code. Your device will ask for your fingerprint, face or screen lock first."
    >
      <Card>
        <CardHeader>
          <CardTitle>Face check</CardTitle>
        </CardHeader>
        <CardContent>
          <FaceSettings enrolled={hasFace(user)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recovery code</CardTitle>
        </CardHeader>
        <CardContent>
          <NewRecoveryCode hasCode={hasActiveRecoveryCode(user.id)} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
