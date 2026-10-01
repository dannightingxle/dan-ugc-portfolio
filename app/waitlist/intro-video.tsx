"use client";

import { useEffect, useRef, useState } from "react";

/* 9:16 intro video. Drop the file at public/waitlist/intro.mp4 (and optionally
   a still at public/waitlist/intro.jpg) - until then a placeholder shows. */
const SRC = "/waitlist/intro.mp4";
const POSTER = "/waitlist/intro.jpg";

export default function IntroVideo() {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  // A 404 can fire before hydration attaches onError, so check once on mount too.
  useEffect(() => {
    const el = ref.current;
    if (el && (el.error || el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) setMissing(true);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[380px] aspect-[9/16] rounded-2xl overflow-hidden border border-[color:var(--border)] bg-[color:var(--bg-card)] shadow-xl">
      {missing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
          <span className="grid place-items-center size-14 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
            <svg viewBox="0 0 24 24" className="size-6 translate-x-px" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <p className="text-sm text-[color:var(--text-muted)]">Intro video coming soon</p>
        </div>
      ) : (
        <video
          ref={ref}
          src={SRC}
          poster={POSTER}
          controls
          playsInline
          /* iOS in-app browsers (TikTok, Instagram) only honour the legacy
             attributes - without them a tap kicks the clip into fullscreen. */
          webkit-playsinline="true"
          x5-playsinline="true"
          preload="metadata"
          onError={() => setMissing(true)}
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      )}
    </div>
  );
}
