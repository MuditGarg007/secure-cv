import type { ReactNode } from "react";
import { VoiceButton } from "@/components/common/VoiceButton";

/**
 * Standard page frame: title + 🔊 button + content, mobile-first (works at 360 px).
 * `voiceText` defaults to the title; pass the screen's main instruction.
 */
export function PageShell({
  title,
  voiceText,
  children,
  wide = false,
}: {
  title: string;
  voiceText?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-md"} flex-1 px-4 py-6`}>
      <div className="mb-6 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        <VoiceButton text={voiceText ?? title} />
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </main>
  );
}

/** Big primary-action button classes (icon + text, thumb-sized). Use with <Button className={BIG}>. */
export const BIG = "h-12 w-full text-base gap-2";
