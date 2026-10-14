"use client";
// Props are a contract: used in /signup step 3 (SignupWizard) and inside FaceSettings.
// Two steps, one upload: 5 face photos, then the user's own hand gesture recorded 3 times.
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Hand, Loader2, ScanFace } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BIG } from "@/components/common/PageShell";
import { api, ApiClientError } from "@/lib/api";
import { speak, stopSpeaking } from "@/lib/voice";
import { errorMessage, withReauth } from "@/lib/webauthn-client";
import { buildFrameForm, CameraError, captureFrames, openCamera, stopStream, syntheticStream } from "@/lib/camera";
import {
  ENROLL_FRAME_COUNT,
  ENROLL_FRAME_INTERVAL_MS,
  GESTURE_ENROLL_CAPTURES,
  GESTURE_ENROLL_FRAME_INTERVAL_MS,
  GESTURE_ENROLL_FRAMES_PER_CAPTURE,
  GESTURE_ENROLL_READY_MS,
  GESTURE_ENROLL_REST_MS,
} from "@/server/config";
import { enrollStep, type EnrollHint } from "@/server/bio/rules";
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
  | { kind: "gesture"; problem?: string }
  | { kind: "recording"; round: number; stage: "ready" | "hold" | "rest" }
  | { kind: "saving" }
  | { kind: "done" };

const FAKE_OPTIONS = [
  "pass",
  "fail:no_face",
  "fail:multiple_faces",
  "fail:low_quality",
  "fail:no_hand",
  "fail:gesture_unstable",
] as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

export function FaceEnrollPanel({ onDone, allowSkip }: FaceEnrollPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Face photos wait here (in memory only) while the gesture is recorded, so a gesture retry
  // doesn't mean retaking them.
  const faceRef = useRef<Blob[] | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "consent" });
  const [consent, setConsent] = useState(false);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [fake, setFake] = useState<string>(FAKE_OPTIONS[0]);
  const status = useBioStatus();

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopStream(streamRef.current);
      stopSpeaking();
      faceRef.current = null;
    },
    [],
  );

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

  async function captureFace() {
    const video = videoRef.current;
    if (!video) return;
    setPhase({ kind: "capturing" });
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
    faceRef.current = frames.map((f) => f.blob);
    setPhase({ kind: "gesture" });
  }

  async function recordGesture() {
    const video = videoRef.current;
    if (!video || !faceRef.current) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const blobs: Blob[] = [];
    try {
      for (let round = 0; round < GESTURE_ENROLL_CAPTURES; round++) {
        setPhase({ kind: "recording", round, stage: "ready" });
        speak(round === 0 ? "Show your gesture next to your face, and hold it." : "Show your gesture again.");
        await sleep(GESTURE_ENROLL_READY_MS, ac.signal);
        setPhase({ kind: "recording", round, stage: "hold" });
        const frames = await captureFrames(video, {
          durationMs: GESTURE_ENROLL_FRAMES_PER_CAPTURE * GESTURE_ENROLL_FRAME_INTERVAL_MS,
          fps: 1000 / GESTURE_ENROLL_FRAME_INTERVAL_MS,
          maxFrames: GESTURE_ENROLL_FRAMES_PER_CAPTURE,
          dropLate: false,
          signal: ac.signal,
        });
        if (frames.length !== GESTURE_ENROLL_FRAMES_PER_CAPTURE) {
          setPhase({ kind: "gesture", problem: "The camera was too slow. Please try again." });
          return;
        }
        blobs.push(...frames.map((f) => f.blob));
        if (round < GESTURE_ENROLL_CAPTURES - 1) {
          setPhase({ kind: "recording", round, stage: "rest" });
          speak("Lower your hand.");
          await sleep(GESTURE_ENROLL_REST_MS, ac.signal);
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      throw e;
    }
    await save([...faceRef.current, ...blobs]);
  }

  async function save(frames: Blob[]) {
    setPhase({ kind: "saving" });
    try {
      const meta = { consent: true, ...(status?.fake ? { fake } : {}) };
      const res = await withReauth(() =>
        api<{ ok: boolean; hint?: EnrollHint }>("/api/bio/enroll", { method: "POST", form: buildFrameForm(meta, frames) }),
      );
      if (res.ok) {
        faceRef.current = null;
        closeCamera();
        speak("All set.");
        setPhase({ kind: "done" });
        onDone(true);
        return;
      }
      const hint = res.hint ?? "low_quality";
      if (enrollStep(hint) === "gesture") {
        setPhase({ kind: "gesture", problem: ENROLL_HINT_TEXT[hint] });
      } else {
        faceRef.current = null;
        setPhase({ kind: "camera", problem: ENROLL_HINT_TEXT[hint] });
      }
    } catch (e) {
      const message =
        e instanceof ApiClientError && e.code === "CANCELLED"
          ? "The passkey check was cancelled. Record your gesture again to save."
          : errorMessage(e);
      setPhase({ kind: "gesture", problem: message });
    }
  }

  if (phase.kind === "done") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Face and gesture check is set up</AlertTitle>
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
            faceRef.current = null;
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
            Your face plus a hand gesture you choose confirm it&apos;s really you when a sign-in looks unusual, and
            speed up account recovery. It never replaces your passkey.
          </p>
          <p className="text-muted-foreground">
            We take 5 photos of your face and 3 short clips of your gesture, turn them into one encrypted template and
            throw the images away. You can delete the template any time on the Security page.
          </p>
        </div>
        <Label className="flex items-start gap-3 rounded-lg border p-3 text-sm font-normal leading-snug">
          <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
          I agree to a face and hand scan and to storing an encrypted template for sign-in checks.
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

  const faceStep = phase.kind === "camera" || phase.kind === "capturing";
  const busy = phase.kind === "capturing" || phase.kind === "recording" || phase.kind === "saving";
  const problem = (phase.kind === "camera" || phase.kind === "gesture") && phase.problem;
  const banner =
    phase.kind === "recording"
      ? {
          title: phase.stage === "rest" ? "Lower your hand" : "Show your gesture",
          sub: `Recording ${phase.round + 1} of ${GESTURE_ENROLL_CAPTURES}${phase.stage === "hold" ? ": hold it…" : ""}`,
        }
      : null;

  return (
    <div className="flex flex-col gap-4">
      {stream && (
        <CameraView stream={stream} videoRef={videoRef} oval={faceStep}>
          {banner && (
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-3 rounded-lg bg-white/90 p-2 text-black shadow dark:bg-black/80 dark:text-white">
              <Hand className="size-10 shrink-0" aria-hidden />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{banner.sub}</span>
                <span className="text-lg font-semibold">{banner.title}</span>
              </div>
            </div>
          )}
        </CameraView>
      )}
      <p className="sr-only" aria-live="assertive">
        {banner ? `${banner.title}. ${banner.sub}` : ""}
      </p>

      {faceStep ? (
        <p className="text-sm">
          <span className="font-medium">Step 1 of 2.</span> Put your face inside the oval, look at the camera and keep
          still. Only you in view.
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <span className="font-medium">Step 2 of 2: your own gesture.</span> Pick any hand shape you can repeat, like
            crossed fingers or three fingers up. Keep it to yourself: you&apos;ll be asked for it on every check.
          </p>
          <p className="text-muted-foreground">
            We record it 3 times. Hold it next to your face with one hand, and lower your hand when asked. Use the same
            hand every time.
          </p>
        </div>
      )}

      {problem && (
        <Alert>
          <AlertTitle>Let&apos;s try again</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      {status?.fake && !busy && <DevFakePicker value={fake} onChange={setFake} options={FAKE_OPTIONS} />}

      {faceStep ? (
        <Button
          className={BIG}
          disabled={busy}
          onClick={() => captureFace().catch(() => setPhase({ kind: "camera", problem: "The camera stopped. Try again." }))}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ScanFace />}
          {phase.kind === "capturing" ? "Hold still…" : "Take photos"}
        </Button>
      ) : (
        <Button
          className={BIG}
          disabled={busy}
          onClick={() => recordGesture().catch(() => setPhase({ kind: "gesture", problem: "The camera stopped. Try again." }))}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Hand />}
          {phase.kind === "recording" ? "Recording…" : phase.kind === "saving" ? "Saving…" : "Record my gesture"}
        </Button>
      )}
      {allowSkip && !busy && (
        <Button variant="ghost" className={BIG} onClick={() => setPhase({ kind: "skip" })}>
          Skip for now
        </Button>
      )}
    </div>
  );
}
