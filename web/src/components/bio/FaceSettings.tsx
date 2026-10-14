"use client";
// CONTRACT, owned by agent B (bio). Props are FROZEN.
// Used by agent A on /security: enroll / re-enroll / delete face + gesture (reauth via withReauth).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanFace, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BIG } from "@/components/common/PageShell";
import { api, ApiClientError } from "@/lib/api";
import { errorMessage, withReauth } from "@/lib/webauthn-client";
import { FaceEnrollPanel } from "./FaceEnrollPanel";

export type FaceSettingsProps = { enrolled: boolean };

export function FaceSettings({ enrolled }: FaceSettingsProps) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await withReauth(() => api("/api/bio", { method: "DELETE" }));
      setConfirmOpen(false);
      toast.success("Face and gesture data deleted.");
      router.refresh();
    } catch (e) {
      if (!(e instanceof ApiClientError && e.code === "CANCELLED")) toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanFace className="size-5" /> Face and gesture check
          <Badge variant={enrolled ? "default" : "secondary"}>{enrolled ? "On" : "Off"}</Badge>
        </CardTitle>
        <CardDescription>
          {enrolled
            ? "Unusual sign-ins ask for your face, your own gesture and one hand sign we pick. Recovery with your code takes 1 day."
            : "Off: unusual sign-ins are blocked, and recovery with your code takes 3 days."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {enrolling ? (
          <FaceEnrollPanel
            allowSkip
            onDone={(ok) => {
              setEnrolling(false);
              if (ok) {
                toast.success(enrolled ? "Face and gesture updated." : "Face and gesture check is on.");
                router.refresh();
              }
            }}
          />
        ) : (
          <>
            <Button className={BIG} onClick={() => setEnrolling(true)}>
              <ScanFace /> {enrolled ? "Redo face and gesture" : "Set up face check"}
            </Button>
            {enrolled && (
              <Button variant="destructive" className={BIG} onClick={() => setConfirmOpen(true)}>
                <Trash2 /> Delete my face and gesture data
              </Button>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your face and gesture data?</AlertDialogTitle>
            <AlertDialogDescription>
              Your encrypted face and gesture template is erased. After that, unusual sign-ins are blocked instead of checked, and
              account recovery with your code takes 3 days instead of 1. You can set it up again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>
              <Trash2 /> {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
