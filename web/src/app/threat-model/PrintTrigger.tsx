"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print / save-as-PDF button for the (server-rendered) threat-model page. */
export function PrintButton() {
  return (
    <Button variant="outline" size="icon-lg" aria-label="Print or save as PDF" title="Print or save as PDF" onClick={() => window.print()}>
      <Printer />
    </Button>
  );
}
