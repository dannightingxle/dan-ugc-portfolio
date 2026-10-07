import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "../_lib/supabase/server";
import { adminClient, adminEnabled } from "../_lib/supabase/admin";
import { isOwner } from "../_lib/owners";
import { TRIAL, billingEnabled, priceLabel } from "../_lib/billing/stripe";

export const metadata: Metadata = { title: "Admin" };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/* Launch-day numbers for owners only (HUB_OWNER_EMAILS): sign-ups, trials,
   paying members, founder spots and the latest feedback. */
export default async function Admin() {
  const user = await currentUser();
  if (!user || !isOwner(user.email) || !adminEnabled) notFound();
  const admin = adminClient();

  const [users, billing, feedback, usage, price] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 15 }),
    admin.from("hub_billing").select("status, founder, cancel_at_period_end"),
    admin.from("hub_feedback").select("message, email, page, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("hub_usage").select("rows, via").gte("at", daysAgo(30)),
    priceLabel(),
  ]);

  const rows = billing.data ?? [];
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const total = "total" in users.data ? (users.data.total as number) : users.data.users.length;
  const founders = rows.filter((r) => r.founder).length;
  const cancelling = rows.filter((r) => r.cancel_at_period_end && ["trialing", "active"].includes(r.status ?? "")).length;
  const sharedRows = (usage.data ?? []).filter((u) => u.via === "shared").reduce((s, u) => s + (u.rows ?? 0), 0);

  const tiles: [string, string | number, string?][] = [
    ["Accounts", total],
    ["On a free trial", count("trialing")],
    ["Paying", count("active")],
    ["Payment failed", count("past_due")],
    ["Cancelling", cancelling],
    ["Founder spots taken", `${founders}/${TRIAL.founderSlots}`],
    ["Signed up, no card yet", Math.max(0, total - rows.filter((r) => r.status).length)],
    ["Shared TrendTrack rows (30d)", sharedRows],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl">Admin</h1>
        <p className="mt-2 text-text-muted">
          {billingEnabled ? `Billing on${price ? ` · ${price}` : ""}` : "Billing off"} · trials: {TRIAL.founderDays} days for the first {TRIAL.founderSlots},
          then {TRIAL.days} days. Revenue and invoices live in your Stripe dashboard.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="text-xs text-text-dim">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Newest accounts</h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-card text-sm">
          {users.data.users.map((u) => (
            <div key={u.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
              <span>
                {(u.user_metadata?.name as string) || "-"} <span className="text-text-dim">{u.email}</span>
              </span>
              <span className="text-text-dim">{new Date(u.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Latest feedback</h2>
        {(feedback.data ?? []).length === 0 ? (
          <p className="text-sm text-text-dim">Nothing yet.</p>
        ) : (
          <div className="space-y-2">
            {feedback.data!.map((f, i) => (
              <div key={i} className="rounded-xl border border-border bg-bg-card p-4 text-sm">
                <p className="whitespace-pre-wrap">{f.message}</p>
                <p className="mt-2 text-xs text-text-dim">
                  {f.email} · {f.page} · {new Date(f.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
