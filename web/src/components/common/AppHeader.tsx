import Link from "next/link";
import { getCurrentSession } from "@/server/auth/sessions";
import { isAdmin } from "@/server/users";
import { SignOutButton } from "@/components/common/SignOutButton";
import { Logomark } from "@/components/common/Brand";
import { NavLinks } from "@/components/common/NavLinks";

const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/devices", label: "Devices" },
  { href: "/activity", label: "Activity" },
  { href: "/security", label: "Security" },
];

export async function AppHeader() {
  const ctx = await getCurrentSession();
  const signedIn = ctx && !ctx.session.stepUpPending;
  const links = signedIn && isAdmin(ctx.user) ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-4 py-2">
        <Link
          href={signedIn ? "/home" : "/"}
          className="flex h-10 items-center gap-2 rounded-lg text-lg font-bold tracking-tighter focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logomark className="size-6" /> Secure
        </Link>
        {signedIn ? (
          <>
            <nav aria-label="Main" className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
              <NavLinks links={links} />
            </nav>
            <span className="ml-auto sm:ml-0">
              <SignOutButton />
            </span>
          </>
        ) : (
          <Link
            href="/threat-model"
            className="mono-label ml-auto rounded-md px-2 py-2 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            [ Threat model ]
          </Link>
        )}
      </div>
    </header>
  );
}
