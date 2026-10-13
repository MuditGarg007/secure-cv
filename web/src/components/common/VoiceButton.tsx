"use client";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speak } from "@/lib/voice";

/** 🔊 button that reads `text` aloud. Put one on every screen (docs/flows.md). */
export function VoiceButton({ text, label = "Read aloud" }: { text: string; label?: string }) {
  return (
    <Button type="button" variant="outline" size="icon-lg" aria-label={label} title={label} onClick={() => speak(text)}>
      <Volume2 />
    </Button>
  );
}
