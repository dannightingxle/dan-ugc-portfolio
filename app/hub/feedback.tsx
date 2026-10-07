"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount } from "./account-provider";
import { browserClient } from "./_lib/supabase/browser";
import { BRAND } from "./_lib/brand";

/* "Feedback" button: a short message that lands in the hub_feedback table
   (read it in Supabase → Table editor). Without accounts it opens an email. */

export function FeedbackButton({ className = "" }: { className?: string }) {
  const { user } = useAccount();
  const [open, setOpen] = useState(false);
  if (!user) {
    if (!BRAND.supportEmail) return null;
    return (
      <a href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`${BRAND.name} feedback`)}`} className={`text-sm text-text-muted hover:text-text ${className}`}>
        Feedback
      </a>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`text-sm text-text-muted hover:text-text ${className}`}>
        Feedback
      </button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAccount();
  const page = usePathname();
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await browserClient().from("hub_feedback").insert({ message: message.trim(), page, email: user?.email ?? null });
    setState(error ? "error" : "sent");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">Send feedback</h2>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="Close">
            ✕
          </button>
        </div>
        {state === "sent" ? (
          <>
            <p className="text-text-muted">Thanks - that&apos;s gone straight to the team.</p>
            <button type="button" onClick={onClose} className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover">
              Done
            </button>
          </>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <textarea
              autoFocus
              required
              maxLength={5000}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Something broken, confusing, or missing? Tell us."
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {state === "error" && <p className="text-sm text-accent">Couldn&apos;t send that - please try again.</p>}
            <button
              disabled={state === "sending" || !message.trim()}
              className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
