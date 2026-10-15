"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header nav pills; the current section gets the lime dot. */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <li key={l.href} className="shrink-0">
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                active
                  ? "border-border bg-secondary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              {active && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
