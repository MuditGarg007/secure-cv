import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Keyhole logomark from the landing page. `shadow` colours the two offset facets. */
export function Logomark({ className, shadow = "var(--gray)" }: { className?: string; shadow?: string }) {
  return (
    <svg viewBox="30 30 84 84" className={className} aria-hidden="true">
      <path d="M80 70 L96 60 L104 108 L86 108 Z" fill={shadow} />
      <path d="M36 36 H58 L48 48 H36 Z" fill={shadow} />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M72 36a22 22 0 0 1 9.6 41.8L86 108H58l4.4-30.2A22 22 0 0 1 72 36Zm0 13a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z"
      />
    </svg>
  );
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}

/** Wipe-reveal heading text (bar sweeps in, text follows). Styles in globals.css. */
export function Wipe({ children }: { children: ReactNode }) {
  return (
    <span className="wipe block">
      <span className="wipe__text">{children}</span>
      <span className="wipe__bar" aria-hidden="true" />
    </span>
  );
}

/** Landing-page split-pill CTA as a Next link. `icon` defaults to the logomark. */
export function CtaLink({
  tone = "lime",
  icon,
  children,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { tone?: "lime" | "dark" | "ghost"; icon?: ReactNode }) {
  return (
    <Link className={`cta cta--${tone} ${className}`} {...props}>
      <span className="cta__icon">{icon ?? <Logomark shadow="color-mix(in srgb, currentColor 45%, transparent)" />}</span>
      <span className="cta__label">
        <span>{children}</span>
        <span className="cta__arrows">
          <Arrow className="cta__arrow cta__arrow--a" />
          <Arrow className="cta__arrow cta__arrow--b" />
        </span>
      </span>
    </Link>
  );
}
