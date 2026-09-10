"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What to ask the camera for, most hopeful first. A phone can hand over its
 * whole sensor; a laptop webcam cannot, and some browsers answer an
 * impossible constraint by refusing outright rather than by giving what they
 * have — which is how asking for 4032px stopped the viewfinder opening on a
 * laptop at all. So each is tried in turn, and the last one asks for nothing
 * but a camera.
 */
export const CAMERA_LADDER: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 4032 },
      height: { ideal: 3024 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  { video: { facingMode: { ideal: "environment" } }, audio: false },
  { video: true, audio: false },
];

/** The first of the ladder that this device will actually give us. */
export async function openStream(
  ask: (c: MediaStreamConstraints) => Promise<MediaStream>,
): Promise<MediaStream> {
  let last: unknown;
  for (const constraints of CAMERA_LADDER) {
    try {
      return await ask(constraints);
    } catch (error) {
      last = error;
    }
  }
  throw last ?? new Error("No camera");
}

type Props = {
  guides: boolean;
  /** The saved picture is a centre square, so the guides show it. */
  square?: boolean;
  /** Skip the viewfinder and hand straight over to the camera app. */
  systemCamera?: boolean;
  /** Flip left to right, in the preview and in what is saved. */
  mirror?: boolean;
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
};

/**
 * Live viewfinder with centering guides. If getUserMedia is unavailable or
 * refused — iOS in-app browsers, denied permission — the whole thing falls
 * back to the system camera via a file input, so the flow never dead-ends.
 */
export function Camera({
  guides,
  square = true,
  systemCamera,
  mirror,
  onCapture,
  onCancel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "live" | "unavailable">(
    systemCamera ? "unavailable" : "starting",
  );
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    // Asking for the camera is what triggers the permission prompt, so when
    // the camera app is the choice, never ask.
    if (systemCamera) return;
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        const stream = await openStream((constraints) =>
          navigator.mediaDevices.getUserMedia(constraints),
        );
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState("live");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [systemCamera]);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (mirror) {
      // The preview is flipped, so the file has to be flipped too — what you
      // framed is what you keep.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture, mirror]);

  return (
    <div className="fixed inset-0 z-50 bg-ink">
      <div className="relative h-full w-full overflow-hidden">
        {state !== "unavailable" && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover ${
              mirror ? "-scale-x-100" : ""
            }`}
          />
        )}

        {state === "unavailable" && (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center text-paper">
            <p className="text-sm leading-relaxed text-paper/70">
              {systemCamera
                ? "Shoot it with the camera app. Frame it square if you can — the picture is cropped to a square."
                : "No viewfinder available here. Use your phone's camera instead — the rating works exactly the same."}
            </p>
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="border border-paper px-6 py-3 text-[0.6875rem] tracking-[0.22em]"
              >
                OPEN CAMERA
              </button>
              <button
                type="button"
                onClick={() => libraryRef.current?.click()}
                className="px-6 py-2 text-[0.6875rem] tracking-[0.22em] text-paper/70"
              >
                CHOOSE FROM LIBRARY
              </button>
            </div>
          </div>
        )}

        {guides && square && state === "live" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col">
            {/* Everything outside the square is dimmed: the saved picture is
                a centre crop, so this is exactly what you get to keep. */}
            <div className="flex-1 bg-ink/45" />
            <div className="relative aspect-square w-full border-y border-paper/30">
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, index) => (
                  <div
                    key={index}
                    className="border-r border-b border-paper/20 last:border-r-0 [&:nth-child(3n)]:border-r-0 [&:nth-child(n+7)]:border-b-0"
                  />
                ))}
              </div>
              {/* Centering ring: fill it with the pizza. */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="aspect-square w-[86%] rounded-full border border-dashed border-paper/45" />
              </div>
              <div className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-accent" />
              <div className="absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-accent" />
            </div>
            <div className="flex-1 bg-ink/45" />
          </div>
        )}

        {flash && <div className="absolute inset-0 bg-paper opacity-80" />}

        {/* Pushed down the same distance as the wordmark: iOS blurs the top
            of the screen as it scrolls, and this row was catching it. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+2rem)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 text-[0.6875rem] tracking-[0.22em] text-paper/80"
          >
            CANCEL
          </button>
          <span className="text-[0.6875rem] tracking-[0.22em] text-paper/60">
            FRAME THE PIZZA
          </span>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="px-2 py-1 text-[0.6875rem] tracking-[0.22em] text-paper/80"
          >
            LIBRARY
          </button>
        </div>

        {state === "live" && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[calc(env(safe-area-inset-bottom)+2rem)]">
            <button
              type="button"
              onClick={shoot}
              aria-label="Take photo"
              className="h-[72px] w-[72px] rounded-full border-2 border-paper p-1 transition-transform active:scale-90"
            >
              <span className="block h-full w-full rounded-full bg-paper" />
            </button>
          </div>
        )}

        {/* Two inputs, because `capture` is what forces the camera: with it
            the picker never appears, which is why LIBRARY used to open the
            camera instead of the photo library. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onCapture(file);
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onCapture(file);
          }}
        />
      </div>
    </div>
  );
}
