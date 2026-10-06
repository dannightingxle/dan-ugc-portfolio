"use client";

import type { PaymentStatus, Project } from "../_lib/store";
import { paymentDue } from "../_lib/store";

/* Form bits shared by the project board and project page. */

export const input =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none transition placeholder:text-text-dim focus:border-accent";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-text-dim">{hint}</span>}
    </label>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PaymentPill({ project }: { project: Project }) {
  const due = paymentDue(project);
  const status: PaymentStatus | "Overdue" = due?.overdue ? "Overdue" : project.paymentStatus;
  const tone = {
    "Not invoiced": "bg-text/5 text-text-dim",
    Invoiced: "bg-warn-soft text-warn",
    Overdue: "bg-accent-soft text-accent",
    Paid: "bg-good-soft text-good",
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>;
}

/** Turn a typed amount like "£1,250" into 1250. */
export function parseMoney(v: string): number | null {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
}
