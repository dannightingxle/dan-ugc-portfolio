"use client";

/* A short burst of confetti for the good moments: a job marked paid, the last
   deliverable ticked off. Skipped for people who've asked for less motion. */

const COLOURS = ["var(--accent)", "var(--good)", "var(--warn)", "var(--share-b)", "#f472b6"];

export function celebrate(from?: { x: number; y: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = from?.x ?? window.innerWidth / 2;
  const y = from?.y ?? window.innerHeight / 3;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden";
  document.body.appendChild(layer);

  for (let i = 0; i < 36; i++) {
    const bit = document.createElement("span");
    const size = 6 + Math.random() * 5;
    bit.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() > 0.5 ? 1 : 0.45)}px;background:${COLOURS[i % COLOURS.length]};border-radius:${Math.random() > 0.6 ? "50%" : "2px"}`;
    layer.appendChild(bit);
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 170;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 120;
    bit.animate(
      [
        { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.3}px, ${dy + 260}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), 2000);
}

/** Where a click happened, so the confetti comes from the button you pressed. */
export function pointOf(e: { clientX: number; clientY: number; currentTarget: EventTarget }) {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect?.();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
}
