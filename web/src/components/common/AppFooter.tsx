import Link from "next/link";
import { Logomark } from "@/components/common/Brand";

/** Slim version of the landing footer: mark, legal line, a couple of public links. */
export function AppFooter() {
  return (
    <footer className="border-t border-dashed print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5">
        <p className="mono-label flex items-center gap-2">
          <Logomark className="size-4 text-foreground" />© 2026 Secure · Passkeys &amp; Presence
        </p>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link href="/threat-model" className="mono-label transition-colors hover:text-primary">
            Threat model
          </Link>
          <a
            href="https://github.com/MuditGarg007/secure-cv"
            target="_blank"
            rel="noopener"
            className="mono-label transition-colors hover:text-primary"
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
