import { PageShell } from "@/components/common/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requirePageSession } from "@/server/auth/sessions";
import { parseAuthorize } from "@/server/oauth/params";
import { hasFace } from "@/server/users";
import { AuthorizeClient } from "./AuthorizeClient";

// /oauth/authorize: "Sign in with Secure" consent screen for a registered app (docs/oauth.md).
// Bad client / redirect_uri is shown here and never redirected to.
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const raw = await searchParams;
  const parsed = parseAuthorize(raw);
  if (!parsed.ok) {
    return (
      <PageShell eyebrow="Sign in with Secure" title="Can't continue">
        <Alert variant="destructive">
          <AlertTitle>{parsed.message}</AlertTitle>
          <AlertDescription>Go back to the app and try again.</AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") query.set(k, v);
  const { user } = await requirePageSession({ next: `/oauth/authorize?${query}` });

  const { params, clientName } = parsed;
  const strong = params.acr_values === "liveness";
  return (
    <PageShell
      eyebrow="Sign in with Secure"
      title={strong ? "Approve request" : `Continue to ${clientName}`}
      voiceText={
        strong
          ? `${clientName} asks you to approve: ${params.binding_message ?? "a sensitive action"}. Confirm with your passkey, then a quick face and gesture check.`
          : `${clientName} wants to sign you in. Confirm with your passkey.`
      }
    >
      <AuthorizeClient
        params={params}
        clientName={clientName}
        handle={user.handle}
        displayName={user.displayName}
        enrolled={hasFace(user)}
      />
    </PageShell>
  );
}
