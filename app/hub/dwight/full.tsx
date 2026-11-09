"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Composer, History, Thread, rememberedConversation, useDwight } from "./chat";

/* The full page: your conversations down the side (behind a button on a
   phone) and the chat with room to read tables and lists. */

export function DwightPage() {
  const asked = useSearchParams().get("c");
  const d = useDwight(asked ?? rememberedConversation());
  const [draft, setDraft] = useState("");
  const [showList, setShowList] = useState(false);
  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] max-w-5xl gap-4 md:h-[calc(100dvh-9rem)]">
      <aside
        className={`${showList ? "fixed inset-0 z-50 block bg-bg-card pt-4" : "hidden"} w-full shrink-0 overflow-y-auto md:static md:block md:w-64 md:rounded-2xl md:border md:border-border md:bg-bg-card`}
      >
        <div className="flex items-center justify-between px-3 pb-2 md:pt-3">
          <p className="font-semibold">Conversations</p>
          <button
            type="button"
            onClick={() => {
              d.open(null);
              setShowList(false);
            }}
            className="text-sm font-medium text-accent hover:underline"
          >
            + New
          </button>
        </div>
        <History
          d={d}
          onOpen={(id) => {
            d.open(id);
            setShowList(false);
          }}
        />
        {showList && (
          <button type="button" onClick={() => setShowList(false)} className="m-3 text-sm text-text-muted md:hidden">
            Close
          </button>
        )}
      </aside>
      <section aria-label={d.name} className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border bg-bg-card">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h1 className="truncate font-serif text-2xl">{d.name}</h1>
          <button type="button" onClick={() => setShowList(true)} className="text-sm text-text-muted hover:text-accent md:hidden">
            Conversations
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Thread d={d} onPick={setDraft} />
        </div>
        <Composer d={d} draft={draft} setDraft={setDraft} />
      </section>
    </div>
  );
}
