import { PageShell } from "@/components/common/PageShell";
import { RecoverStartForm } from "./_components/RecoverStartForm";

const VOICE =
  "Lost your device? Type your account name and your recovery code. " +
  "If you set up a face check, we will ask you to show your face, your own gesture and one hand sign. " +
  "Then there is a waiting time, and we warn your other devices. " +
  "After the wait, come back on this same browser and make a new passkey.";

export default function RecoverPage() {
  return (
    <PageShell eyebrow="Account recovery" title="Recover your account" voiceText={VOICE}>
      <p className="text-muted-foreground">
        Lost your phone or laptop? Use the recovery code you saved when you created your account.
      </p>
      <RecoverStartForm />
      <section className="rounded-2xl bg-card p-5 text-sm ring-1 ring-border">
        <h2 className="mono-label mb-3">[ What happens next ]</h2>
        <ol className="list-decimal space-y-2 pl-5 text-fg-3 marker:font-mono marker:text-primary">
          <li>If you set up a face check, show your face, your own gesture and one hand sign on camera.</li>
          <li>
            We wait (1 day with the face check, 3 days without) and alert all your signed-in devices,
            so the real owner can cancel.
          </li>
          <li>Come back on this same browser and create a new passkey. Your old passkeys stop working.</li>
          <li>You get a new recovery code. Save it.</li>
        </ol>
      </section>
    </PageShell>
  );
}
