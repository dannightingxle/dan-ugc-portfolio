"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SourceBadge, useApi } from "./_lib/ui";
import type { Source } from "./_lib/types";
import { ThemePicker } from "./theme-picker";
import { useAccount } from "./account-provider";

const LINKS = [
  { href: "/hub", label: "Home" },
  { href: "/hub/projects", label: "Projects" },
  { href: "/hub/find", label: "Find ads" },
  { href: "/hub/scripts", label: "Scripts", soon: true },
];

export function HubNav() {
  const path = usePathname();
  const { user } = useAccount();
  const { data } = useApi<{ source: Source }>(path === "/hub/login" ? null : "/api/hub/status");
  if (path === "/hub/login") return null;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/hub" className="shrink-0 whitespace-nowrap font-serif text-xl italic">
          Creator <span className="text-accent">Hub</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/hub" ? path === "/hub" || path.startsWith("/hub/ads") : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 transition ${
                  active ? "bg-accent-soft text-accent" : "text-text-muted hover:text-text"
                }`}
              >
                {l.label}
                {l.soon && <span className="ml-1.5 rounded-full bg-text/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-dim">Soon</span>}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden md:block">
            <SourceBadge source={data?.source} />
          </span>
          <ThemePicker />
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
  );
}
