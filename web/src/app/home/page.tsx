import Link from "next/link";
import { Activity, ArrowRight, KeyRound, MapPin, Plus, Shield, Smartphone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/common/PageShell";
import { RecoveryBanner } from "@/components/recovery/RecoveryBanner";
import { LocalTime } from "@/components/auth/LocalTime";
import { NotificationList } from "@/components/auth/NotificationList";
import { unreadNotifications } from "@/server/notifications";
import { requirePageSession } from "@/server/auth/sessions";
import { hasActiveRecoveryCode, recentSignIns, type SignInSummary } from "@/server/auth/account";
import { labelFromUA } from "@/lib/ua";

const LINKS = [
  { href: "/devices", label: "Devices", icon: Smartphone },
  { href: "/link", label: "Add a device", icon: Plus },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/security", label: "Security", icon: Shield },
];

function SignInLine({ label, s }: { label: string; s: SignInSummary }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        {label}: <LocalTime ms={s.at} /> · {s.country ?? "location unknown"} · {labelFromUA(s.ua)}
      </span>
    </p>
  );
}

export default async function HomePage() {
  const { user } = await requirePageSession({ next: "/home" });
  const notifications = unreadNotifications(user.id).map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt }));
  const [current, previous] = recentSignIns(user.id, 2);
  const hasCode = hasActiveRecoveryCode(user.id);

  return (
    <PageShell
      eyebrow="Your account"
      title={`Hello, ${user.displayName}`}
      voiceText={`Hello ${user.displayName}. You are signed in. ${
        notifications.length ? `You have ${notifications.length} new alerts.` : "You have no new alerts."
      }`}
    >
      <RecoveryBanner userId={user.id} />

      {!hasCode && (
        <Alert>
          <KeyRound />
          <AlertDescription>
            You don&apos;t have a recovery code yet.{" "}
            <Link href="/security" className="underline">
              Make one now
            </Link>{" "}
            so you can get back in if you lose your devices.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationList items={notifications} />
        </CardContent>
      </Card>

      {current && (
        <Card>
          <CardHeader>
            <CardTitle>Sign-ins</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <SignInLine label="This sign-in" s={current} />
            {previous && <SignInLine label="Before that" s={previous} />}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex h-24 flex-col justify-between overflow-hidden rounded-2xl bg-card p-4 ring-1 ring-border transition-shadow hover:ring-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span aria-hidden className="dot-grid absolute inset-0 opacity-0 transition-opacity group-hover:opacity-40" />
            <Icon className="relative size-5 text-primary" />
            <span className="relative flex items-center justify-between text-base font-bold tracking-tighter">
              {label}
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </span>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
