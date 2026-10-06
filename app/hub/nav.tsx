"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SourceBadge, useApi } from "./_lib/ui";
import type { Source } from "./_lib/types";
import { ThemePicker } from "./theme";

const LINKS = [
  { href: "/hub", label: "My ads" },
  { href: "/hub/find", label: "Find ads" },
  { href: "/hub/projects", label: "Projects" },
];

export function HubNav() {
  const path = usePathname();
  const { data } = useApi<{ source: Source }>(path === "/hub/login" ? null : "/api/hub/status");
  if (path === "/hub/login") return null;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/hub" className="font-serif text-xl italic">
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
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:block">
            <SourceBadge source={data?.source} />
          </span>
          <ThemePicker />
        </div>
      </div>
    </header>
  );
}
