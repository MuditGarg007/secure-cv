"use client";
// CONTRACT, owned by agent B (bio). Props are FROZEN.
// Used by agent A in /signup step 3 and inside FaceSettings.
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, ScanFace } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BIG } from "@/components/common/PageShell";
import { api, ApiClientError } from "@/lib/api";
import { errorMessage, withReauth } from "@/lib/webauthn-client";
import { buildFrameForm, CameraError, captureFrames, openCamera, stopStream, syntheticStream } from "@/lib/camera";
import { ENROLL_FRAME_COUNT, ENROLL_FRAME_INTERVAL_MS } from "@/server/config";
import type { EnrollHint } from "@/server/bio/rules";
import { CameraView } from "./CameraView";
import { DevFakePicker } from "./DevFakePicker";
import { cameraErrorText, ENROLL_HINT_TEXT, SKIP_WARNING } from "./gestures";
import { useBioStatus } from "./useBioStatus";

export type FaceEnrollPanelProps = {
  /** Called after a successful enrollment (true) or when the user skips (false). */
  onDone: (enrolled: boolean) => void;
  /** Show a "Skip" button with the skip warning from docs/flows.md. */
  allowSkip?: boolean;
};

type Phase =
  | { kind: "consent" }
  | { kind: "skip" }
  | { kind: "starting" }
  | { kind: "camera"; problem?: string }
  | { kind: "capturing" }
  | { kind: "saving" }
  | { kind: "done" };

const FAKE_OPTIONS = ["pass", "fail:no_face", "fail:multiple_faces", "fail:low_quality"] as const;

export function FaceEnrollPanel({ onDone, allowSkip }: FaceEnrollPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "consent" });
  const [consent, setConsent] = useState(false);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [fake, setFake] = useState<string>(FAKE_OPTIONS[0]);
  const status = useBioStatus();

  useEffect(() => () => stopStream(streamRef.current), []);

  function closeCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }

  async function start() {
    setCameraProblem(null);
    setPhase({ kind: "starting" });
    try {
      let s: MediaStream;
      try {
        s = await openCamera();
      } catch (e) {
        if (!status?.fake) throw e;
        s = syntheticStream(); // BIO_FAKE dev run without a camera
      }
      streamRef.current = s;
      setStream(s);
      setPhase({ kind: "camera" });
    } catch (e) {
      setCameraProblem(cameraErrorText(e instanceof CameraError ? e.kind : "failed"));
      setPhase({ kind: "consent" });
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setPhase({ kind: "capturing" });
    try {
      const frames = await captureFrames(video, {
        durationMs: ENROLL_FRAME_COUNT * ENROLL_FRAME_INTERVAL_MS,
        fps: 1000 / ENROLL_FRAME_INTERVAL_MS,
        maxFrames: ENROLL_FRAME_COUNT,
        dropLate: false, // enrollment needs all 5 photos, not precise timing
      });
      if (frames.length !== ENROLL_FRAME_COUNT) {
        setPhase({ kind: "camera", problem: "The camera was too slow. Please try again." });
        return;
      }
      setPhase({ kind: "saving" });
      const blobs = frames.map((f) => f.blob);
      const meta = { consent: true, ...(status?.fake ? { fake } : {}) };
      const res = await withReauth(() =>
        api<{ ok: boolean; hint?: EnrollHint }>("/api/bio/enroll", { method: "POST", form: buildFrameForm(meta, blobs) }),
      );
      if (res.ok) {
        closeCamera();
        setPhase({ kind: "done" });
        onDone(true);
      } else {
        setPhase({ kind: "camera", problem: ENROLL_HINT_TEXT[res.hint ?? "low_quality"] });
      }
    } catch (e) {
      const message =
        e instanceof ApiClientError && e.code === "CANCELLED"
          ? "The passkey check was cancelled. Take the photos again to save your face."
          : errorMessage(e);
      setPhase({ kind: "camera", problem: message });
    }
  }

  if (phase.kind === "done") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Face check is set up</AlertTitle>
        <AlertDescription>We&apos;ll use it to confirm it&apos;s you on unusual sign-ins and recovery.</AlertDescription>
      </Alert>
    );
  }

  if (phase.kind === "skip") {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="destructive">
          <AlertTitle>Skip face check?</AlertTitle>
          <AlertDescription>{SKIP_WARNING}</AlertDescription>
        </Alert>
        <Button className={BIG} onClick={() => setPhase({ kind: "consent" })}>
          <ScanFace /> Set up face check
        </Button>
        <Button
          variant="outline"
          className={BIG}
          onClick={() => {
            closeCamera();
            onDone(false);
          }}
        >
          Skip anyway
        </Button>
      </div>
    );
  }

  if (phase.kind === "consent" || phase.kind === "starting") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Your face plus a few hand signs confirm it&apos;s really you when a sign-in looks unusual, and speed up
            account recovery. It never replaces your passkey.
          </p>
          <p className="text-muted-foreground">
            We take 5 photos, turn them into an encrypted face template and throw the photos away. You can delete the
            template any time on the Security page.
          </p>
        </div>
        <Label className="flex items-start gap-3 rounded-lg border p-3 text-sm font-normal leading-snug">
          <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
          I agree to a face scan and to storing an encrypted face template for sign-in checks.
        </Label>
        {cameraProblem && (
          <Alert variant="destructive">
            <AlertDescription>{cameraProblem}</AlertDescription>
          </Alert>
        )}
        <Button className={BIG} disabled={!consent || phase.kind === "starting"} onClick={start}>
          {phase.kind === "starting" ? <Loader2 className="animate-spin" /> : <Camera />} Open camera
        </Button>
        {allowSkip && (
          <Button variant="ghost" className={BIG} onClick={() => setPhase({ kind: "skip" })}>
            Skip for now
          </Button>
        )}
      </div>
    );
  }

  const busy = phase.kind === "capturing" || phase.kind === "saving";
  return (
    <div className="flex flex-col gap-4">
      {stream && <CameraView stream={stream} videoRef={videoRef} oval />}
      <p className="text-sm">Put your face inside the oval, look at the camera and keep still. Only you in view.</p>
      {phase.kind === "camera" && phase.problem && (
        <Alert>
          <AlertTitle>Let&apos;s try again</AlertTitle>
          <AlertDescription>{phase.problem}</AlertDescription>
        </Alert>
      )}
      {status?.fake && !busy && <DevFakePicker value={fake} onChange={setFake} options={FAKE_OPTIONS} />}
      <Button className={BIG} disabled={busy} onClick={capture}>
        {busy ? <Loader2 className="animate-spin" /> : <ScanFace />}
        {phase.kind === "capturing" ? "Hold still…" : phase.kind === "saving" ? "Saving…" : "Take photos"}
      </Button>
      {allowSkip && !busy && (
        <Button variant="ghost" className={BIG} onClick={() => setPhase({ kind: "skip" })}>
          Skip for now
        </Button>
      )}
    </div>
  );
}
