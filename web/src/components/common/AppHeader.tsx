import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getCurrentSession } from "@/server/auth/sessions";
import { isAdmin } from "@/server/users";
import { SignOutButton } from "@/components/common/SignOutButton";

const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/devices", label: "Devices" },
  { href: "/activity", label: "Activity" },
  { href: "/security", label: "Security" },
];

export async function AppHeader() {
  const ctx = await getCurrentSession();
  const signedIn = ctx && !ctx.session.stepUpPending;
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href={signedIn ? "/home" : "/"} className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5" /> Secure
        </Link>
        {signedIn && (
          <nav className="flex flex-1 flex-wrap items-center gap-3 text-sm">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:underline">
                {l.label}
              </Link>
            ))}
            {isAdmin(ctx.user) && (
              <Link href="/admin" className="hover:underline">
                Admin
              </Link>
            )}
            <span className="ml-auto">
              <SignOutButton />
            </span>
          </nav>
        )}
      </div>
    </header>
  );
}
