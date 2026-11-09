"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isPublicPath, useAccount } from "../account-provider";
import { Composer, History, Thread, rememberedConversation, useDwight } from "./chat";

/* Dwight in the corner of every page: a bubble that opens the chat in a
   panel (the whole screen on a phone), which stays open as you move between
   pages. "Open full page" carries on the same conversation at /hub/dwight. */

export function DwightDock() {
  const path = usePathname();
  const { features, billing, user } = useAccount();
  const on =
    Boolean(user) && features.includes("dwight") && billing.hasAccess && !isPublicPath(path) && path !== "/hub/login" && !path.startsWith("/hub/dwight");
  if (!on) return null;
  return <Dock />;
}

function Dock() {
  const d = useDwight(rememberedConversation());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ask ${d.name}`}
        className="fixed right-4 z-40 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-on-accent shadow-lg hover:bg-accent-hover bottom-[calc(5rem+var(--tray-h,0px)+env(safe-area-inset-bottom))] md:right-5 md:bottom-[calc(1.25rem+var(--tray-h,0px))]"
      >
        <span aria-hidden className="relative flex h-2 w-2">
          {d.working && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-on-accent opacity-75" />}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-on-accent" />
        </span>
        {d.working ? `${d.name} is working…` : `Ask ${d.name}`}
      </button>
    );

  return (
    <section
      aria-label={d.name}
      className="fixed inset-0 z-50 flex flex-col bg-bg-card pb-[env(safe-area-inset-bottom)] md:inset-auto md:bottom-5 md:right-5 md:h-[min(680px,calc(100vh-6rem))] md:w-[420px] md:rounded-2xl md:border md:border-border md:shadow-2xl"
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        {renaming !== null ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              await d.rename(renaming);
              setRenaming(null);
            }}
          >
            <input
              aria-label="Name"
              autoFocus
              maxLength={40}
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <button className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">Save</button>
          </form>
        ) : (
          <button type="button" onClick={() => setRenaming(d.name)} title="Rename" className="min-w-0 flex-1 truncate text-left font-semibold">
            {d.name}
          </button>
        )}
        <HeaderButton
          label={view === "history" ? "Back to the chat" : "Conversations"}
          onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
          icon="M4 6h16M4 12h16M4 18h10"
        />
        <HeaderButton
          label="New conversation"
          onClick={() => {
            d.open(null);
            setView("chat");
          }}
          icon="M12 5v14M5 12h14"
        />
        <Link
          href={d.conversation ? `/hub/dwight?c=${d.conversation.id}` : "/hub/dwight"}
          onClick={() => setOpen(false)}
          aria-label="Open full page"
          title="Open full page"
          className="hidden rounded-lg p-1.5 text-text-muted hover:bg-text/5 hover:text-text md:block"
        >
          <Icon d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
        </Link>
        <HeaderButton label="Close" onClick={() => setOpen(false)} icon="M6 6l12 12M18 6 6 18" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "history" ? (
          <History
            d={d}
            onOpen={(id) => {
              d.open(id);
              setView("chat");
            }}
          />
        ) : (
          <Thread d={d} compact onPick={setDraft} />
        )}
      </div>
      <Composer d={d} draft={draft} setDraft={setDraft} />
    </section>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function HeaderButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-lg p-1.5 text-text-muted hover:bg-text/5 hover:text-text">
      <Icon d={icon} />
    </button>
  );
}
