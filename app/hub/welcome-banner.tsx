"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "./account-provider";
import { shortDate } from "./_lib/ui";

/* Shown on the home page straight after checkout (?welcome=1). */
export function WelcomeBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const { billing } = useAccount();
  if (params.get("welcome") !== "1") return null;

  const trial = billing.status === "trialing" && billing.trialEnd;
  return (
    <div className="space-y-4 rounded-2xl border border-accent/20 bg-accent-soft p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">You&apos;re in - welcome to your desk 🎉</h2>
          {trial && (
            <p className="mt-1 text-sm text-text-muted">
              Your {billing.founder ? "founder" : "free"} trial has started. You won&apos;t be charged until {shortDate(billing.trialEnd)}, and you can cancel any
              time from your account.
            </p>
          )}
        </div>
        <button type="button" onClick={() => router.replace("/hub")} className="text-text-dim hover:text-text" aria-label="Dismiss">
          ✕
        </button>
      </div>
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-xl bg-bg-card p-3">
          <strong>1.</strong> Open the <Link href="/hub/projects" className="text-accent underline">example project</Link> to see how a job fits together.
        </li>
        <li className="rounded-xl bg-bg-card p-3">
          <strong>2.</strong> Add your first real brand deal with <Link href="/hub/projects?new=1" className="text-accent underline">+ New project</Link>.
        </li>
        <li className="rounded-xl bg-bg-card p-3">
          <strong>3.</strong> <Link href="/hub/account#trendtrack" className="text-accent underline">Connect TrendTrack</Link> to find and track the ads you&apos;re in.
        </li>
      </ol>
    </div>
  );
}
