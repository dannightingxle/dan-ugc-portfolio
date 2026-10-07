"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Offer } from "../_lib/billing/types";

const FEATURES = [
  "Every brand deal from pitch to paid, with what you're owed",
  "Briefs, deliverables, contacts and links in one place",
  "Find the ads you're in and track their reach (with TrendTrack)",
  "Share cards for your socials and pitch deck",
];

export function StartTrial({
  offer,
  name,
  returning,
  autoStart,
  notice,
}: {
  offer: Offer;
  name: string;
  returning: boolean;
  autoStart: boolean;
  notice: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/hub/billing/checkout", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start checkout.");
      window.location.href = json.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Straight from sign-up: go to card details without an extra click.
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void start();
    }
  }, [autoStart]);

  const trial = offer.trialDays >= 28 ? `${Math.round(offer.trialDays / 30)} months` : `${offer.trialDays} days`;
  const title = returning ? "Welcome back" : offer.trialDays > 0 ? `Start your ${trial} free trial` : "Pick up where you left off";

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6 sm:py-10">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-accent">Hi {name}</p>
        <h1 className="font-serif text-4xl">{title}</h1>
        {offer.founder && offer.trialDays > 0 && (
          <p className="text-text-muted">
            You&apos;re one of our first {offer.founderSlots} creators, so you get <strong className="text-text">{trial} free</strong>.{" "}
            {offer.spotsLeft <= 20 && <>Only {offer.spotsLeft} founder spot{offer.spotsLeft === 1 ? "" : "s"} left.</>}
          </p>
        )}
      </div>

      {notice && <p className="rounded-xl bg-bg-elevated px-4 py-3 text-center text-sm text-text-muted">{notice}</p>}

      <div className="space-y-5 rounded-2xl border border-border bg-bg-card p-6">
        <ul className="space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-2.5 text-sm">
              <span className="mt-0.5 text-accent">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-5">
          {offer.trialDays > 0 ? (
            <p className="text-sm text-text-muted">
              <strong className="text-text">£0 today.</strong> Add your card to start - you won&apos;t be charged until your trial ends
              {offer.price ? `, then it's ${offer.price}` : ""}. Cancel any time before then and you won&apos;t pay a thing.
            </p>
          ) : (
            <p className="text-sm text-text-muted">{offer.price ? `${offer.price}, ` : ""}cancel any time.</p>
          )}
        </div>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Opening secure checkout…" : offer.trialDays > 0 ? "Add card & start free trial" : "Continue to checkout"}
        </button>
        {error && <p className="text-center text-sm text-accent">{error}</p>}
        <p className="text-center text-xs text-text-dim">Payments are handled securely by Stripe. We never see your card details.</p>
      </div>

      <p className="text-center text-sm text-text-dim">
        <Link href="/hub/account" className="hover:text-text">
          Account settings
        </Link>{" "}
        ·{" "}
        <Link href="/hub/terms" className="hover:text-text">
          Terms
        </Link>
      </p>
    </div>
  );
}
