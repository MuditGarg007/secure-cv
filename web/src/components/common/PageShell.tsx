import type { ReactNode } from "react";
import { VoiceButton } from "@/components/common/VoiceButton";
import { Wipe } from "@/components/common/Brand";

/**
 * Standard page frame: mono eyebrow, wipe-in title + 🔊 button, dashed rule, content.
 * Mobile-first (works at 360 px). `voiceText` defaults to the title; pass the screen's main instruction.
 */
export function PageShell({
  title,
  eyebrow,
  voiceText,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  voiceText?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={`relative isolate mx-auto w-full ${wide ? "max-w-5xl" : "max-w-md"} flex-1 px-4 pt-8 pb-12`}>
      <PageGrid />
      <div className="mb-6">
        {eyebrow && <p className="mono-label mb-3">[ {eyebrow} ]</p>}
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-[2.125rem] leading-[1.05] font-bold sm:text-[2.5rem]">
            <Wipe key={title}>{title}</Wipe>
          </h1>
          <VoiceButton text={voiceText ?? title} />
        </div>
        <hr className="rule-dashed mt-6" />
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </main>
  );
}

/** Faded dot-matrix tile behind the page head, echoing the landing hero grid. */
export function PageGrid() {
  return (
    <div
      aria-hidden
      className="dot-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 rounded-b-[2rem] opacity-60 [mask-image:radial-gradient(ellipse_70%_80%_at_50%_0%,#000_0,rgb(0_0_0/.4)_55%,transparent_85%)] print:hidden"
    />
  );
}

/** Big primary-action button classes (icon + text, thumb-sized). Use with <Button className={BIG}>. */
export const BIG = "h-12 w-full text-base gap-2";
