"use client";
// CONTRACT, owned by agent B (bio). Props are FROZEN.
// Full liveness UI: fetch challenge, camera, prompt cards + voice, countdown, upload, retry.
// Used by B on /signin/step-up and by agent D on /recover/[id].
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BIG } from "@/components/common/PageShell";
import { api, ApiClientError } from "@/lib/api";
import { speak, stopSpeaking } from "@/lib/voice";
import {
  buildFrameForm,
  CameraError,
  captureFrames,
  openCamera,
  stopStream,
  syntheticStream,
} from "@/lib/camera";
import { CAPTURE_COUNTDOWN_MS } from "@/server/config";
import type { LivenessChallengeDTO, LivenessHint } from "@/server/bio/liveness";
import { CameraView } from "./CameraView";
import { DevFakePicker } from "./DevFakePicker";
import { cameraErrorText, GESTURE_UI, LIVENESS_HINT_TEXT } from "./gestures";
import { useBioStatus } from "./useBioStatus";

export type LivenessCheckProps = {
  /** POST → LivenessChallengeDTO, e.g. "/api/stepup/challenge" or "/api/recovery/<id>/liveness/challenge". */
  challengeUrl: string;
  /** POST multipart → {passed, hint?, attemptsLeft}. */
  verifyUrl: string;
  onPassed: () => void;
  /** No attempts left (or a non-retryable error). */
  onFailedFinal: () => void;
};

type VerifyResponse = { passed: boolean; hint?: LivenessHint; attemptsLeft: number };

type Phase =
  | { kind: "intro" }
  | { kind: "starting" }
  | { kind: "countdown"; challenge: LivenessChallengeDTO; left: number }
  | { kind: "capturing"; challenge: LivenessChallengeDTO; index: number; progress: number }
  | { kind: "checking" }
  | { kind: "retry"; message: string; attemptsLeft?: number }
  | { kind: "error"; message: string }
  | { kind: "passed" }
  | { kind: "final"; message: string };

const FAKE_OPTIONS = ["pass", "fail:prompt_missing", "fail:no_face", "fail:face_mismatch", "fail:timing"] as const;

// Errors after which retrying can't help: the caller decides what happens next.
const FINAL_CODES = new Set([
  "BIO_NOT_ENROLLED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RECOVERY_STATE",
  "RECOVERY_INVALID",
  "CREDENTIAL_REVOKED",
  "BLOCKED",
]);

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

function videoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new CameraError("failed")), 5000);
    video.addEventListener(
      "loadeddata",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export function LivenessCheck({ challengeUrl, verifyUrl, onPassed, onFailedFinal }: LivenessCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [fake, setFake] = useState<string>(FAKE_OPTIONS[0]);
  const status = useBioStatus();

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopStream(streamRef.current);
      stopSpeaking();
    },
    [],
  );

  function closeCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }

  async function ensureCamera(): Promise<MediaStream> {
    if (streamRef.current) return streamRef.current;
    let s: MediaStream;
    try {
      s = await openCamera();
    } catch (e) {
      if (!status?.fake) throw e;
      s = syntheticStream(); // BIO_FAKE dev run without a camera
    }
    streamRef.current = s;
    setStream(s);
    return s;
  }

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: "starting" });
    try {
      await ensureCamera();
      const challenge = await api<LivenessChallengeDTO>(challengeUrl, { method: "POST" });
      const first = GESTURE_UI[challenge.prompts[0]];
      speak(`Get ready. Hold each hand sign next to your face. First: ${first.say}.`);
      for (let left = Math.ceil(CAPTURE_COUNTDOWN_MS / 1000); left > 0; left--) {
        setPhase({ kind: "countdown", challenge, left });
        await sleep(1000, ac.signal);
      }
      const video = videoRef.current;
      if (!video) throw new CameraError("failed");
      await videoReady(video);

      const slot = challenge.captureWindowMs / challenge.prompts.length;
      let shown = -1;
      setPhase({ kind: "capturing", challenge, index: 0, progress: 0 });
      const frames = await captureFrames(video, {
        durationMs: challenge.captureWindowMs,
        signal: ac.signal,
        onTick: (elapsed) => {
          const index = Math.min(challenge.prompts.length - 1, Math.floor(elapsed / slot));
          if (index !== shown) {
            shown = index;
            speak(GESTURE_UI[challenge.prompts[index]].say);
          }
          setPhase({ kind: "capturing", challenge, index, progress: Math.min(1, elapsed / challenge.captureWindowMs) });
        },
      });

      setPhase({ kind: "checking" });
      const meta = {
        challengeId: challenge.challengeId,
        timestamps: frames.map((f) => f.t),
        ...(status?.fake ? { fake } : {}),
      };
      const res = await api<VerifyResponse>(verifyUrl, {
        method: "POST",
        form: buildFrameForm(meta, frames.map((f) => f.blob)),
      });
      if (ac.signal.aborted) return;

      if (res.passed) {
        closeCamera();
        speak("Thanks, you're verified.");
        setPhase({ kind: "passed" });
        onPassed();
      } else if (res.attemptsLeft <= 0) {
        closeCamera();
        const message = "We couldn't confirm it's you, and there are no attempts left.";
        speak(message);
        setPhase({ kind: "final", message });
        onFailedFinal();
      } else {
        const message = LIVENESS_HINT_TEXT[res.hint ?? "try_again"];
        speak(message);
        setPhase({ kind: "retry", message, attemptsLeft: res.attemptsLeft });
      }
    } catch (e) {
      if (ac.signal.aborted && !(e instanceof ApiClientError)) return;
      if (e instanceof CameraError) {
        setPhase({ kind: "error", message: cameraErrorText(e.kind) });
      } else if (e instanceof ApiClientError && FINAL_CODES.has(e.code)) {
        closeCamera();
        setPhase({ kind: "final", message: e.message });
        onFailedFinal();
      } else if (e instanceof ApiClientError && e.code === "CHALLENGE_EXPIRED") {
        setPhase({ kind: "retry", message: LIVENESS_HINT_TEXT.too_slow });
      } else if (e instanceof ApiClientError) {
        setPhase({ kind: "error", message: e.message });
      } else {
        setPhase({ kind: "error", message: "Something went wrong. Please try again." });
      }
    }
  }

  const busy = phase.kind === "starting" || phase.kind === "countdown" || phase.kind === "capturing";
  const prompt =
    phase.kind === "countdown"
      ? { g: GESTURE_UI[phase.challenge.prompts[0]], step: 1, of: phase.challenge.prompts.length }
      : phase.kind === "capturing"
        ? { g: GESTURE_UI[phase.challenge.prompts[phase.index]], step: phase.index + 1, of: phase.challenge.prompts.length }
        : null;

  return (
    <div className="flex flex-col gap-4">
      {phase.kind === "intro" && (
        <div className="flex flex-col gap-2 text-sm">
          <p>You&apos;ll see 3 hand signs, one at a time. Show each one next to your face until the next appears.</p>
          <p className="text-muted-foreground">Takes about 15 seconds. Use good light and keep only your face in view.</p>
        </div>
      )}

      {stream && (
        <CameraView stream={stream} videoRef={videoRef}>
          {phase.kind === "countdown" && (
            <div className="grid size-full place-items-center bg-black/30">
              <span className="text-7xl font-bold text-white drop-shadow">{phase.left}</span>
            </div>
          )}
          {prompt && (
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-3 rounded-lg bg-white/90 p-2 text-black shadow dark:bg-black/80 dark:text-white">
              <span className="text-5xl leading-none" aria-hidden>
                {prompt.g.emoji}
              </span>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  {phase.kind === "countdown" ? "First sign" : `Sign ${prompt.step} of ${prompt.of}`}
                </span>
                <span className="text-lg font-semibold">{prompt.g.label}</span>
                <span className="text-xs">Hold it next to your face</span>
              </div>
            </div>
          )}
        </CameraView>
      )}

      <p className="sr-only" aria-live="assertive">
        {prompt ? `${prompt.g.label}. Hold it next to your face.` : ""}
      </p>

      {phase.kind === "capturing" && <Progress value={Math.round(phase.progress * 100)} aria-label="Time left" />}

      {phase.kind === "checking" && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Checking…
        </p>
      )}

      {phase.kind === "retry" && (
        <Alert>
          <AlertTitle>Let&apos;s try that again</AlertTitle>
          <AlertDescription>
            {phase.message}
            {phase.attemptsLeft !== undefined && (
              <span className="mt-1 block font-medium">
                {phase.attemptsLeft} {phase.attemptsLeft === 1 ? "attempt" : "attempts"} left
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {phase.kind === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Face check didn&apos;t run</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {phase.kind === "passed" && (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Verified</AlertTitle>
          <AlertDescription>Thanks, that was you.</AlertDescription>
        </Alert>
      )}

      {phase.kind === "final" && (
        <Alert variant="destructive">
          <AlertTitle>Face check failed</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {status?.fake && (phase.kind === "intro" || phase.kind === "retry" || phase.kind === "error") && (
        <DevFakePicker value={fake} onChange={setFake} options={FAKE_OPTIONS} />
      )}

      {(phase.kind === "intro" || phase.kind === "retry" || phase.kind === "error" || busy) && (
        <Button className={BIG} onClick={run} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> {phase.kind === "starting" ? "Starting camera…" : "Recording…"}
            </>
          ) : phase.kind === "intro" ? (
            <>
              <Camera /> Start face check
            </>
          ) : (
            <>
              <RotateCcw /> Try again
            </>
          )}
        </Button>
      )}
    </div>
  );
}
