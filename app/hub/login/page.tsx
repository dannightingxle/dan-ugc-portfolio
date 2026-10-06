"use client";

import { useState } from "react";

export default function HubLogin() {
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
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-4 rounded-2xl border border-border bg-bg-card p-6">
      <h1 className="font-serif text-3xl italic">
        Creator <span className="text-accent">Hub</span>
      </h1>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
