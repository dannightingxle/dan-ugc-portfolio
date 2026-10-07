"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { accountsEnabled } from "../_lib/supabase/config";
import { browserClient } from "../_lib/supabase/browser";
import { BRAND } from "../_lib/brand";

/* Sign in / create account (Supabase), or the single shared password when
   accounts aren't set up. */

const ERRORS: Record<string, string> = {
  not_invited: `This email hasn't been invited to ${BRAND.name} yet.`,
  link: "That link has expired or was already used. Try again below.",
};

export default function HubLogin() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/hub/welcome" className="font-serif text-3xl">
            {BRAND.logo[0]} <span className="text-accent">{BRAND.logo[1]}</span>
          </Link>
          <p className="mt-1 text-sm text-text-muted">{BRAND.tagline}</p>
        </div>
        <Suspense>{accountsEnabled ? <AccountForm /> : <PasswordForm />}</Suspense>
      </div>
    </div>
  );
}

type Mode = "signin" | "signup" | "forgot";

function AccountForm() {
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/hub") ? params.get("next")! : "/hub";
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(ERRORS[params.get("error") ?? ""] ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const db = browserClient();
    // New accounts go straight on to card details (the billing page skips this when billing is off).
    const afterSignup = "/hub/billing?start=1";
    const confirmUrl = `${location.origin}/hub/auth/confirm?next=${encodeURIComponent(afterSignup)}`;

    if (mode === "signin") {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      else return (window.location.href = next);
    } else if (mode === "signup") {
      const { data, error } = await db.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: confirmUrl } });
      if (error) setError(error.message);
      else if (data.session) return (window.location.href = afterSignup);
      else setNotice(`Nearly there - we've sent a confirmation link to ${email}. Open it on this device to carry on.`);
    } else {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/hub/auth/confirm?next=${encodeURIComponent("/hub/account?reset=1")}`,
      });
      if (error) setError(error.message);
      else setNotice(`If there's an account for ${email}, a reset link is on its way.`);
    }
    setBusy(false);
  }

  const field = "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-bg-card p-6">
      {mode !== "forgot" && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg-elevated p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md py-1.5 font-medium transition ${mode === m ? "bg-bg-card text-text shadow-sm" : "text-text-dim hover:text-text"}`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}
      {mode === "forgot" && <p className="text-sm text-text-muted">Enter your email and we&apos;ll send you a link to set a new password.</p>}

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required />
        )}
        <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" required />
        {mode !== "forgot" && (
          <input
            className={field}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Choose a password (8+ characters)" : "Password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
        )}
        {mode === "signup" && (
          <p className="text-xs text-text-dim">
            By creating an account you agree to the{" "}
            <Link href="/hub/terms" className="underline hover:text-text">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/hub/privacy" className="underline hover:text-text">
              Privacy Policy
            </Link>
            .
          </p>
        )}
        {error && <p className="text-sm text-accent">{error}</p>}
        {notice && <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{notice}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-sm text-text-dim">
        {mode === "signin" && (
          <button type="button" onClick={() => setMode("forgot")} className="hover:text-text">
            Forgot your password?
          </button>
        )}
        {mode === "forgot" && (
          <button type="button" onClick={() => setMode("signin")} className="hover:text-text">
            ← Back to sign in
          </button>
        )}
      </p>
    </div>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/hub/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/hub";
    else {
      setError("That password didn't work.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-bg-card p-6">
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
      />
      {error && <p className="text-sm text-accent">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
