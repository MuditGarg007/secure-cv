"use client";
import { useEffect, type ReactNode, type RefObject } from "react";

/** Mirrored live preview (frames are captured unmirrored), optional face oval and overlay. */
export function CameraView({
  stream,
  videoRef,
  oval = false,
  children,
}: {
  stream: MediaStream;
  videoRef: RefObject<HTMLVideoElement | null>;
  oval?: boolean;
  children?: ReactNode;
}) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [stream, videoRef]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} muted playsInline autoPlay className="size-full -scale-x-100 object-cover" />
      {oval && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="aspect-[3/4] h-[78%] rounded-[50%] border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}
      {children && <div className="pointer-events-none absolute inset-0">{children}</div>}
    </div>
  );
}
