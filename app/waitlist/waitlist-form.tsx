"use client";

import { useRef, useState } from "react";
import {
  COMMUNITY,
  FORMATS,
  GOAL,
  GUARANTEE,
  HOURS,
  PRICE,
  STAGE,
  STRUGGLES,
  type WaitlistEntry,
} from "./questions";

const EMPTY: WaitlistEntry = {
  name: "",
  email: "",
  handle: "",
  stage: "",
  goal: "",
  hours: "",
  struggles: [],
  wishlist: "",
  formats: [],
  price: "",
  guarantee: "",
  community: "",
  notes: "",
};

const STEPS = ["About you", "What you need", "The programme"];

type Status = "idle" | "sending" | "done" | "error";

export default function WaitlistForm() {
  const [data, setData] = useState<WaitlistEntry>(EMPTY);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const honeypot = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const set = <K extends keyof WaitlistEntry>(key: K, value: WaitlistEntry[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const toggle = (key: "struggles" | "formats", value: string) =>
    setData((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));

  // What's still missing on the current step, or "" when it's complete.
  const missing = (s: number) => {
    if (s === 0) {
      if (!data.name.trim()) return "Add your first name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return "Add a valid email address.";
      if (!data.stage) return "Pick where you're at right now.";
      if (!data.goal) return "Pick what you're aiming for.";
      if (!data.hours) return "Pick how many hours a week you could give it.";
    }
    if (s === 1 && data.struggles.length === 0) return "Pick at least one struggle.";
    if (s === 2) {
      if (!data.price) return "Pick what you'd pay.";
      if (!data.guarantee) return "Tell me how much the guarantee matters.";
      if (!data.community) return "Pick a community platform.";
    }
    return "";
  };

  const scrollToTop = () => top.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const next = () => {
    const m = missing(step);
    if (m) return setError(m);
    setError("");
    setStep((s) => s + 1);
    scrollToTop();
  };

  const back = () => {
    setError("");
    setStep((s) => s - 1);
    scrollToTop();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    const m = missing(step);
    if (m) return setError(m);
    setError("");
    setStatus("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, company: honeypot.current?.value ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
      setStatus("done");
      scrollToTop();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (status === "done") {
    return (
      <div ref={top} className="scroll-mt-24 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-8 sm:p-10 text-center">
        <span className="mx-auto grid place-items-center size-14 rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-6 font-display text-4xl sm:text-5xl">
          You&apos;re on the list, <em className="text-[color:var(--accent)]">{data.name.trim().split(" ")[0]}.</em>
        </h2>
        <p className="mt-4 text-[color:var(--text-muted)] max-w-md mx-auto">
          Thanks for helping me build this. I&apos;ll email you before doors open - waitlist members hear first.
          In the meantime, come say hi on{" "}
          <a href="https://www.tiktok.com/@dannightingxle.ugc" className="text-[color:var(--text)] underline underline-offset-4 decoration-[color:var(--accent)]">
            TikTok
          </a>{" "}
          or{" "}
          <a href="https://www.instagram.com/dannightingxle.ugc" className="text-[color:var(--text)] underline underline-offset-4 decoration-[color:var(--accent)]">
            Instagram
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="relative rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-6 sm:p-8"
    >
      <div ref={top} className="scroll-mt-24" />

      {/* progress */}
      <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
        <span>
          Step {step + 1} of {STEPS.length} · <span className="text-[color:var(--text-muted)]">{STEPS[step]}</span>
        </span>
        <span>~2 min</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`h-1 rounded-full transition-colors ${i <= step ? "bg-[color:var(--accent)]" : "bg-[color:var(--border)]"}`}
          />
        ))}
      </div>

      {/* Hidden from people, irresistible to bots. */}
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
        {step === 0 && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="First name">
                <input
                  type="text"
                  autoComplete="given-name"
                  value={data.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
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
            <Field label="TikTok or Instagram handle" optional>
              <input
                type="text"
                placeholder="@yourhandle"
                value={data.handle}
                onChange={(e) => set("handle", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Choice label="Where are you at with UGC right now?" options={STAGE} value={data.stage} onChange={(v) => set("stage", v)} />
            <Choice label="What are you aiming for?" options={GOAL} value={data.goal} onChange={(v) => set("goal", v)} />
            <Choice
              label="How many hours a week could you realistically give it?"
              options={HOURS}
              value={data.hours}
              onChange={(v) => set("hours", v)}
            />
          </>
        )}

        {step === 1 && (
          <>
            <Choice
              label="What are your biggest struggles with UGC?"
              hint="Pick as many as you like."
              options={STRUGGLES}
              value={data.struggles}
              onChange={(v) => toggle("struggles", v)}
            />
            <Field label="If you joined this programme, what would your absolute dream outcome be?" optional>
              <textarea
                rows={3}
                placeholder="e.g. 3-4 regular brand deals a month, enough to drop to a four-day week..."
                value={data.wishlist}
                onChange={(e) => set("wishlist", e.target.value)}
                className={`${inputClass} resize-y`}
              />
            </Field>
            <Choice
              label="How would you like to learn?"
              hint="Pick as many as you like."
              options={FORMATS}
              value={data.formats}
              onChange={(v) => toggle("formats", v)}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Choice
              label="If you knew this would help you add at least £1,000 a month for a couple of hours a week, what would you pay as a one-time fee?"
              hint="No monthly subscription - pay once, keep access."
              options={PRICE}
              value={data.price}
              onChange={(v) => set("price", v)}
            />
            <Choice
              label="I'm planning a guarantee: land your first paid deal within 14 days, or I work with you 1:1 until you do. How much does that matter to you?"
              options={GUARANTEE}
              value={data.guarantee}
              onChange={(v) => set("guarantee", v)}
            />
            <Choice
              label="Where would you want the community to live?"
              options={COMMUNITY}
              value={data.community}
              onChange={(v) => set("community", v)}
            />
            <Field label="Anything else you'd want me to know?" optional>
              <textarea
                rows={3}
                value={data.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-[color:var(--accent)]">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="text-sm font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition-colors"
          >
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-[color:var(--accent)] text-[color:var(--bg)] hover:bg-[color:var(--accent-hover)] transition-colors disabled:opacity-60"
        >
          {step < STEPS.length - 1 ? "Next →" : status === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-[15px] text-[color:var(--text)] placeholder:text-[color:var(--text-dim)] outline-none transition-colors focus:border-[color:var(--accent)]";

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-[color:var(--text)]">
        {label}
        {optional && <span className="ml-1.5 font-normal text-[color:var(--text-dim)]">(optional)</span>}
      </span>
      {children}
    </label>
  );
}

/* Chip-style choices: single-select when `value` is a string, multi when it's an array. */
function Choice({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  value: string | string[];
  onChange: (v: string) => void;
}) {
  const multi = Array.isArray(value);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-[color:var(--text)] leading-relaxed">
        {label}
        {hint && <span className="block font-normal text-[color:var(--text-dim)]">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
        {options.map((o) => {
          const on = multi ? value.includes(o) : value === o;
          return (
            <button
              key={o}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => onChange(o)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                on
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--text)]"
                  : "border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
