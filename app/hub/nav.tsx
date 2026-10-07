"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SourceBadge, useApi } from "./_lib/ui";
import type { DataSource } from "./_lib/types";
import { isPublicPath, useAccount } from "./account-provider";
import { BRAND } from "./_lib/brand";
import { FeedbackButton } from "./feedback";

const LINKS = [
  { href: "/hub", label: "Home", icon: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/hub/projects", label: "Projects", icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { href: "/hub/find", label: "Find ads", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.35-4.35" },
  { href: "/hub/scripts", label: "Scripts", soon: true, icon: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" },
];

function isActive(path: string, href: string) {
  return href === "/hub" ? path === "/hub" || path.startsWith("/hub/ads") : path.startsWith(href);
}

export function Logo() {
  return (
    <Link href="/hub" className="shrink-0 whitespace-nowrap font-serif text-xl">
      {BRAND.logo[0]} <span className="text-accent">{BRAND.logo[1]}</span>
    </Link>
  );
}

export function HubNav() {
  const path = usePathname();
  const { user, billing } = useAccount();
  const isPublic = isPublicPath(path);
  const appVisible = !isPublic && billing.hasAccess;
  const { data } = useApi<{ source: DataSource }>(appVisible ? "/api/hub/status" : null);

  if (path === "/hub/login") return null;
  if (isPublic) return <PublicNav signedIn={Boolean(user)} />;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Logo />
          {appVisible && (
            <nav className="hidden gap-1 text-sm md:flex">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 transition ${
                    isActive(path, l.href) ? "bg-accent-soft text-accent" : "text-text-muted hover:text-text"
                  }`}
                >
                  {l.label}
                  {l.soon && <span className="ml-1.5 rounded-full bg-text/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-dim">Soon</span>}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            <TrialBadge />
            {appVisible && (
              <span className="hidden lg:block">
                <SourceBadge source={data?.source} />
              </span>
            )}
            {user && (
              <span className="hidden sm:block">
                <FeedbackButton />
              </span>
            )}
            {user && (
              <Link
                href="/hub/account"
                title={`${user.name} - account`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase transition ${
                  path.startsWith("/hub/account") ? "bg-accent text-on-accent" : "bg-accent-soft text-accent hover:bg-accent hover:text-on-accent"
                }`}
              >
                {user.name.slice(0, 1)}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Phones: tabs along the bottom, where thumbs are. */}
      {appVisible && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4">
            {LINKS.map((l) => {
              const active = isActive(path, l.href);
              return (
                <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-accent" : "text-text-dim"}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={l.icon} />
                  </svg>
                  {l.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}

/** Days left on the free trial, or a nudge when a payment has failed. */
function TrialBadge() {
  const { billing } = useAccount();
  const [now] = useState(() => Date.now());
  if (billing.status === "past_due") {
    return (
      <Link href="/hub/account#billing" className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
        Payment failed - update card
      </Link>
    );
  }
  if (billing.status !== "trialing" || !billing.trialEnd) return null;
  const days = Math.max(0, Math.ceil((new Date(billing.trialEnd).getTime() - now) / 86_400_000));
  return (
    <Link href="/hub/account#billing" className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
      {billing.founder ? "Founder trial" : "Free trial"} · {days} day{days === 1 ? "" : "s"} left
    </Link>
  );
}

function PublicNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/hub/welcome" className="shrink-0 whitespace-nowrap font-serif text-xl">
          {BRAND.logo[0]} <span className="text-accent">{BRAND.logo[1]}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {signedIn ? (
            <Link href="/hub" className="rounded-lg bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover">
              Open your desk
            </Link>
          ) : (
            <>
              <Link href="/hub/login" className="rounded-lg px-3 py-2 text-text-muted hover:text-text">
                Sign in
              </Link>
              <Link href="/hub/login?mode=signup" className="rounded-lg bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover">
                Start free trial
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
