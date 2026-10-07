"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "../account-provider";
import { useProjects, useStars, type Project } from "../_lib/store";
import { browserClient } from "../_lib/supabase/browser";
import { shortDate, useApi } from "../_lib/ui";
import { Section, input } from "../projects/fields";

/* Account page sections: billing, TrendTrack, data export, delete account. */

const TRENDTRACK_URL = process.env.NEXT_PUBLIC_TRENDTRACK_URL || "https://www.trendtrack.io";

async function postForUrl(path: string) {
  const res = await fetch(path, { method: "POST" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error ?? "Something went wrong.");
  window.location.href = json.url;
}

export function BillingSection() {
  const { billing } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!billing.enabled) return null;

  if (billing.owner) {
    return (
      <Section title="Plan">
        <p className="text-sm text-text-muted">You&apos;re an owner of Creator Desk - no subscription needed.</p>
      </Section>
    );
  }

  const status = billing.status;
  const line =
    status === "trialing"
      ? billing.cancelAtPeriodEnd
        ? `${billing.founder ? "Founder trial" : "Free trial"} until ${shortDate(billing.trialEnd)}. You've cancelled, so you won't be charged.`
        : `${billing.founder ? "Founder trial" : "Free trial"} until ${shortDate(billing.trialEnd)}, when your first payment is taken.`
      : status === "active"
        ? billing.cancelAtPeriodEnd
          ? `Cancelled - you can keep using Creator Desk until ${shortDate(billing.periodEnd)}.`
          : `Active. Next payment ${shortDate(billing.periodEnd)}.`
        : status === "past_due"
          ? "Your last payment didn't go through. Update your card to keep your desk open."
          : "No active subscription.";

  return (
    <div id="billing">
      <Section title="Plan & billing">
        <p className="text-sm text-text-muted">
          {billing.founder && <span className="mr-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Founder</span>}
          {line}
        </p>
        <div className="flex flex-wrap gap-2">
          {billing.hasAccess || status ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                await postForUrl("/api/hub/billing/portal").catch((e) => {
                  setError(e.message);
                  setBusy(false);
                });
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {busy ? "Opening…" : "Manage billing, card & invoices"}
            </button>
          ) : null}
          {!billing.hasAccess && (
            <Link href="/hub/billing" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">
              Start subscription
            </Link>
          )}
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
        <p className="text-xs text-text-dim">Cancel any time from &ldquo;Manage billing&rdquo; - you keep access until the end of what you&apos;ve paid for.</p>
      </Section>
    </div>
  );
}

type TTStatus = { connected: boolean; workspace: string | null; via: "own" | "owner" | "shared" | null; canConnect: boolean };

export function TrendTrackSection() {
  const { data, loading } = useApi<TTStatus>("/api/hub/trendtrack");
  const [status, setStatus] = useState<TTStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = status ?? data;

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    const res = await fetch("/api/hub/trendtrack", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ apiKey: key }) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus(json);
      setKey("");
    } else setError(json.error ?? "Something went wrong.");
    setBusy(false);
  }

  return (
    <div id="trendtrack">
    <Section title="TrendTrack">
      {loading && !s ? (
        <p className="text-sm text-text-dim">Checking…</p>
      ) : s?.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" />
            Connected to <strong>{s.workspace}</strong>. Find ads uses your TrendTrack account.
          </p>
          <button type="button" disabled={busy} onClick={() => call("DELETE")} className="text-sm text-text-dim hover:text-accent">
            Disconnect
          </button>
        </div>
      ) : (
        <>
          {s?.via === "owner" || s?.via === "shared" ? (
            <p className="text-sm text-text-muted">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good" />
              Live ad data is included with your account. You can still connect your own TrendTrack below.
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              Connect your{" "}
              <a href={TRENDTRACK_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                TrendTrack
              </a>{" "}
              account to find the ads you&apos;re in and track their reach. You&apos;ll need a plan with API access (Pro or above) - create a key
              in TrendTrack under <em>Settings → API</em> and paste it here.
            </p>
          )}
          {s?.canConnect !== false && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void call("POST");
              }}
            >
              <input
                className={`${input} !w-auto flex-1`}
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="TrendTrack API key"
                required
              />
              <button disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
                {busy ? "Checking…" : "Connect"}
              </button>
            </form>
          )}
          <p className="text-xs text-text-dim">Your key is checked with TrendTrack, stored securely on our server and never shown again.</p>
        </>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </Section>
    </div>
  );
}

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};

function projectsCsv(projects: Project[]) {
  const head = ["Brand", "Project", "Stage", "Fee (GBP)", "Payment", "Invoice no.", "Invoiced on", "Paid on", "Deliver by", "Contact", "Contact email"];
  const rows = projects.map((p) => [
    p.brand,
    p.title,
    p.stage,
    p.fee ?? "",
    p.paymentStatus,
    p.invoiceNumber,
    p.invoicedOn,
    p.paidOn,
    p.due,
    p.contact.name,
    p.contact.email,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function DataSection() {
  const { projects } = useProjects();
  const { stars } = useStars();
  const day = new Date().toISOString().slice(0, 10);
  return (
    <Section title="Your data">
      <p className="text-sm text-text-muted">Download everything, or just your projects as a spreadsheet for your accountant.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => download(`creator-desk-projects-${day}.csv`, "text/csv", projectsCsv(projects))}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          Projects & payments (CSV)
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              `creator-desk-export-${day}.json`,
              "application/json",
              JSON.stringify({ exportedAt: new Date().toISOString(), projects, trackedAds: Object.values(stars) }, null, 2),
            )
          }
          className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          Everything (JSON)
        </button>
      </div>
    </Section>
  );
}

export function DeleteSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/hub/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    if (res.ok) {
      await browserClient().auth.signOut().catch(() => {});
      window.location.href = "/hub/welcome?deleted=1";
      return;
    }
    setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete your account.");
    setBusy(false);
  }

  return (
    <Section title="Delete account">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-text-dim hover:text-accent">
          Delete my account and all my data…
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            This permanently deletes your projects, tracked ads and account, and cancels your subscription straight away. It can&apos;t be
            undone - download your data first if you want a copy. Type <strong>DELETE</strong> to confirm.
          </p>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} !w-40`} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
            <button
              type="button"
              disabled={busy || confirm !== "DELETE"}
              onClick={remove}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete forever"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-text-dim hover:text-text">
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-accent">{error}</p>}
        </div>
      )}
    </Section>
  );
}
