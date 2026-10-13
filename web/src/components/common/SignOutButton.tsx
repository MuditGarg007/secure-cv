"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut /> Sign out
    </Button>
  );
}
