import Link from "next/link";
import { Fingerprint, KeyRound, LifeBuoy, ShieldCheck, Smartphone, UserPlus } from "lucide-react";
import { VoiceButton } from "@/components/common/VoiceButton";
import { CtaLink, Wipe } from "@/components/common/Brand";

const POINTS = [
  { icon: Fingerprint, title: "No password", text: "Sign in with your fingerprint, face or screen lock. No password to forget or leak." },
  { icon: ShieldCheck, title: "No OTP", text: "No OTPs or SMS codes. Fake look-alike sites can't steal your sign-in." },
  { icon: Smartphone, title: "Any device", text: "Use your phone or a security key, add new devices and remove lost ones." },
  { icon: KeyRound, title: "Safe way back", text: "Lost everything? Get back in with your recovery code and a face check." },
];

const LABELS = ["Phishing-resistant", "Inclusive by design", "Recoverable"];

// Dot-matrix tiles behind the hero, a smaller cut of landing/index.html's hero grid.
const TILES = [
  "left-[2%] top-[6%] h-28 w-40",
  "left-[30%] top-[2%] h-24 w-56",
  "right-[4%] top-[8%] h-32 w-44",
  "left-[12%] top-[40%] h-28 w-52",
  "right-[16%] top-[44%] h-24 w-60",
];

export default function Landing() {
  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] [mask-image:radial-gradient(ellipse_65%_70%_at_50%_35%,#000_0,rgb(0_0_0/.45)_50%,transparent_85%)]"
      >
        {TILES.map((t) => (
          <div key={t} className={`dot-grid absolute rounded-3xl opacity-70 ${t}`} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap justify-between gap-x-4 gap-y-1">
          {LABELS.map((l) => (
            <p key={l} className="mono-label">
              {l}
            </p>
          ))}
        </div>
        <VoiceButton text="Welcome. This app has no passwords and no OTP codes. You sign in with your fingerprint, face or screen lock. Press Sign in, or Create account if you are new." />
      </div>
      <hr className="rule-dashed mt-4" />

      <h1 className="mt-10 text-[3.5rem] leading-[0.95] font-bold sm:text-7xl md:text-[6.5rem]">
        <span className="sr-only">Sign in without passwords. </span>
        <span aria-hidden>
          <Wipe>Nothing</Wipe>
          <Wipe>to Phish</Wipe>
        </span>
      </h1>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <p className="font-mono text-xs leading-snug text-fg-3 uppercase sm:max-w-64">
          Passwordless sign-in for public, education and small-business services
        </p>
        <p className="font-mono text-xs leading-snug text-fg-3 uppercase sm:max-w-64 sm:text-right">
          Passkeys log you in. Your face and hand prove it&apos;s really you when it matters.
        </p>
      </div>

      <div className="mt-12 grid gap-12 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-16">
        <div className="flex flex-col gap-3">
          <CtaLink href="/signin" icon={<Fingerprint />} className="w-full">
            Sign in
          </CtaLink>
          <CtaLink href="/signup" tone="dark" icon={<UserPlus />} className="w-full">
            Create account
          </CtaLink>
          <Link
            href="/recover"
            className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <LifeBuoy className="size-4" /> Lost my device?
          </Link>
        </div>

        <ol className="border-t border-dashed border-[var(--gray)]">
          {POINTS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-dashed border-[var(--gray)] py-4">
              <span className="mono-label pt-1">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="flex items-center gap-2 font-bold tracking-tighter">
                  <Icon className="size-4 text-primary" /> {title}
                </p>
                <p className="mt-1 text-sm text-fg-3">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
