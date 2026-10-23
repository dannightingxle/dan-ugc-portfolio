"use client";

import { useState } from "react";
import { Busy } from "../_lib/ui";

/* The waitlist form on the landing page (while BRAND.waitlist is on): first name, last name and email. */

export default function WaitlistForm({ tone = "card" }: { tone?: "card" | "accent" }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/hub/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  const onAccent = tone === "accent";
  if (state === "done") {
    return (
      <p className={`rounded-xl px-4 py-3 text-center text-sm font-medium ${onAccent ? "bg-bg-card text-text" : "bg-good-soft text-good"}`}>
        You&apos;re on the list, {firstName}. We&apos;ll email {email} as soon as it opens.
      </p>
    );
  }

  const field = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none ${
    onAccent ? "border-transparent bg-bg-card text-text focus:border-text" : "border-border bg-bg focus:border-accent"
  }`;
  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" aria-label="First name" autoComplete="given-name" required maxLength={80} />
        <input className={field} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" aria-label="Last name" autoComplete="family-name" required maxLength={80} />
      </div>
      <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" autoComplete="email" required maxLength={200} />
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        name="company"
      />
      {error && <p className={`text-sm ${onAccent ? "text-on-accent" : "text-accent"}`}>{error}</p>}
      <button
        disabled={state === "busy"}
        aria-busy={state === "busy"}
        className={`w-full rounded-xl py-3.5 font-semibold transition disabled:opacity-60 ${
          onAccent ? "bg-bg-card text-accent hover:opacity-90" : "bg-accent text-on-accent hover:bg-accent-hover"
        }`}
      >
        <Busy busy={state === "busy"} label="One moment…">
          Join the waitlist
        </Busy>
      </button>
    </form>
  );
}
