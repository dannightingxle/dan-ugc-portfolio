"use client";

import { useRef, useState } from "react";
import { Choice, Field, inputClass } from "../waitlist/waitlist-form";
import { EXPERIENCE, HELP_FIRST, HOURS, PAID_JOBS, STAGE, type OnboardingEntry } from "./onboarding";

/* The new-member intro form: on /start and under the "You're in" pages. */

const EMPTY: OnboardingEntry = {
  name: "",
  email: "",
  tiktok: "",
  instagram: "",
  otherSocials: "",
  portfolio: "",
  experience: "",
  stage: "",
  paidJobs: "",
  hours: "",
  helpFirst: [],
  goal: "",
  notes: "",
};

type Status = "idle" | "sending" | "done";

export default function OnboardingForm() {
  const [data, setData] = useState<OnboardingEntry>(EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const honeypot = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const set = <K extends keyof OnboardingEntry>(key: K, value: OnboardingEntry[K]) => setData((d) => ({ ...d, [key]: value }));
  const toggleHelp = (v: string) =>
    setData((d) => ({ ...d, helpFirst: d.helpFirst.includes(v) ? d.helpFirst.filter((x) => x !== v) : [...d.helpFirst, v] }));

  const missing = () => {
    if (!data.name.trim()) return "Add your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return "Add a valid email address.";
    if (!data.experience) return "Pick how long you've been doing UGC.";
    if (!data.stage) return "Pick where you're at right now.";
    if (!data.paidJobs) return "Pick how many paid jobs you've done.";
    if (!data.hours) return "Pick how many hours a week you can give it.";
    if (data.helpFirst.length === 0) return "Pick at least one thing you want help with first.";
    if (!data.goal.trim()) return "Tell me what you're hoping to achieve.";
    return "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = missing();
    if (m) return setError(m);
    setError("");
    setStatus("sending");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, company: honeypot.current?.value ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
      setStatus("done");
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (status === "done") {
    return (
      <div ref={top} className="scroll-mt-24 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-8 text-center">
        <h2 className="font-display text-4xl">
          Thanks, <em className="text-[color:var(--accent)]">{data.name.trim().split(" ")[0]}.</em>
        </h2>
        <p className="mt-3 text-[color:var(--text-muted)]">
          That&apos;s really helpful. I&apos;ll read it before we speak, so we can start from where you actually are.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6 sm:p-8">
      <div ref={top} className="scroll-mt-24" />
      <h2 className="font-display text-3xl sm:text-4xl">
        Tell me about <em className="text-[color:var(--accent)]">you.</em>
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-muted)]">
        You might have answered some of these on the waitlist already, but please answer them again. It helps me
        understand where you&apos;re at right now, so I can help you properly from day one. About 3 minutes.
      </p>

      <input
        ref={honeypot}
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] size-px opacity-0"
      />

      <div className="mt-8 flex flex-col gap-8">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Your name">
            <input type="text" autoComplete="name" value={data.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email (the one you paid with)">
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="TikTok" optional>
            <input type="text" placeholder="@yourhandle" value={data.tiktok} onChange={(e) => set("tiktok", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Instagram" optional>
            <input type="text" placeholder="@yourhandle" value={data.instagram} onChange={(e) => set("instagram", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Any other socials" optional>
          <input
            type="text"
            placeholder="YouTube, a second account, anything else"
            value={data.otherSocials}
            onChange={(e) => set("otherSocials", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Your portfolio, if you have one" optional>
          <input
            type="text"
            inputMode="url"
            placeholder="A link to your site, a Drive folder, anything"
            value={data.portfolio}
            onChange={(e) => set("portfolio", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Choice label="How long have you been doing UGC?" options={EXPERIENCE} value={data.experience} onChange={(v) => set("experience", v)} />
        <Choice label="Where are you at right now?" options={STAGE} value={data.stage} onChange={(v) => set("stage", v)} />
        <Choice label="How many paid UGC jobs have you done?" options={PAID_JOBS} value={data.paidJobs} onChange={(v) => set("paidJobs", v)} />
        <Choice label="How many hours a week can you realistically give it?" options={HOURS} value={data.hours} onChange={(v) => set("hours", v)} />
        <Choice
          label="What do you want help with first?"
          hint="Pick as many as you like."
          options={HELP_FIRST}
          value={data.helpFirst}
          onChange={toggleHelp}
        />
        <Field label="What are you hoping to achieve from this?">
          <textarea
            rows={3}
            placeholder="e.g. my first paid deal by Christmas, then £1k a month alongside my job"
            value={data.goal}
            onChange={(e) => set("goal", e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </Field>
        <Field label="Anything else I should know?" optional>
          <textarea rows={3} value={data.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} resize-y`} />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-[color:var(--accent)]">
          {error}
        </p>
      )}

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Send it to Dan"}
        </button>
      </div>
    </form>
  );
}
