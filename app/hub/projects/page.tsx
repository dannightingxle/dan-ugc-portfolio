"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { STAGES, newProject, useProjects, useStars, type Project } from "../_lib/store";
import { gbp, shortDate } from "../_lib/ui";

/* Project board: brand deals from pitch to paid, each with its script. */

export default function ProjectsPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}

function Board() {
  const { projects, save, remove } = useProjects();
  const params = useSearchParams();
  const router = useRouter();
  const [draft, setDraft] = useState<Project | null>(null);

  const openId = params.get("open");
  const editing = draft ?? projects.find((p) => p.id === openId) ?? null;

  function close() {
    setDraft(null);
    if (openId) router.replace("/hub/projects");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl italic sm:text-5xl">Projects</h1>
          <p className="mt-2 text-text-muted">Every brand deal from pitch to paid, with the script alongside.</p>
        </div>
        <button onClick={() => setDraft(newProject())} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-black hover:bg-accent-hover">
          + New project
        </button>
      </div>

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        {STAGES.map((stage) => {
          const items = projects.filter((p) => p.stage === stage);
          return (
            <div key={stage} className="w-64 shrink-0 space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-medium">{stage}</h2>
                <span className="text-xs text-text-dim">{items.length}</span>
              </div>
              <div className="min-h-24 space-y-2 rounded-xl bg-bg-elevated p-2">
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDraft(p)}
                    className="w-full rounded-lg border border-border bg-bg-card p-3 text-left transition hover:border-border-strong"
                  >
                    <p className="text-xs text-text-dim">{p.brand || "No brand"}</p>
                    <p className="text-sm font-medium">{p.title || "Untitled"}</p>
                    <div className="mt-2 flex justify-between text-xs text-text-dim">
                      <span>{p.fee != null ? gbp(p.fee) : ""}</span>
                      <span>{p.due ? `Due ${shortDate(p.due)}` : ""}</span>
                    </div>
                    {p.adIds.length > 0 && <p className="mt-1 text-xs text-accent">★ {p.adIds.length} tracked ad{p.adIds.length > 1 ? "s" : ""}</p>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Editor
          key={editing.id}
          initial={editing}
          onSave={(p) => {
            save(p);
            close();
          }}
          onDelete={() => {
            remove(editing.id);
            close();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

function Editor({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Project;
  onSave: (p: Project) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [p, setP] = useState(initial);
  const { stars } = useStars();
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setP((cur) => ({ ...cur, [k]: v }));

  const words = [p.hook, p.body, p.cta].join(" ").split(/\s+/).filter(Boolean).length;
  const seconds = Math.round(words / 2.5); // ~150 words a minute spoken

  const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(p);
        }}
        className="h-full w-full max-w-xl space-y-5 overflow-y-auto border-l border-border bg-bg-elevated p-5 sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial.title ? "Edit project" : "New project"}</h2>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand">
            <input className={input} value={p.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Fussy" />
          </Field>
          <Field label="Project">
            <input className={input} value={p.title} onChange={(e) => set("title", e.target.value)} placeholder="3 videos - summer launch" />
          </Field>
          <Field label="Stage">
            <select className={input} value={p.stage} onChange={(e) => set("stage", e.target.value as Project["stage"])}>
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fee (£)">
              <input
                className={input}
                inputMode="numeric"
                value={p.fee ?? ""}
                onChange={(e) => set("fee", e.target.value ? Number(e.target.value.replace(/[^\d.]/g, "")) : null)}
              />
            </Field>
            <Field label="Due">
              <input type="date" className={input} value={p.due} onChange={(e) => set("due", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium">Script</h3>
            <span className="text-xs text-text-dim">
              {words} words · ~{seconds}s spoken
            </span>
          </div>
          <Field label="Hook (first 3 seconds)">
            <textarea rows={2} className={input} value={p.hook} onChange={(e) => set("hook", e.target.value)} />
          </Field>
          <Field label="Body">
            <textarea rows={5} className={input} value={p.body} onChange={(e) => set("body", e.target.value)} />
          </Field>
          <Field label="Call to action">
            <textarea rows={2} className={input} value={p.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
        </div>

        <Field label="Notes (brief, contacts, usage rights…)">
          <textarea rows={3} className={input} value={p.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <div className="space-y-2">
          <h3 className="text-sm text-text-muted">Linked ads</h3>
          {Object.values(stars).length === 0 ? (
            <p className="text-sm text-text-dim">
              Star ads in <Link href="/hub/find" className="text-accent">Find ads</Link> to link them here.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {Object.values(stars).map((ad) => (
                <label key={ad.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-card">
                  <input
                    type="checkbox"
                    checked={p.adIds.includes(ad.id)}
                    onChange={(e) => set("adIds", e.target.checked ? [...p.adIds, ad.id] : p.adIds.filter((x) => x !== ad.id))}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-text-dim">{ad.brandName}</span>
                  <span className="truncate">{ad.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button className="flex-1 rounded-xl bg-accent py-2.5 font-medium text-black hover:bg-accent-hover">Save</button>
          {initial.createdAt && (
            <button type="button" onClick={onDelete} className="rounded-xl border border-border px-4 text-sm text-text-dim hover:border-red-500 hover:text-red-400">
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-text-dim">{label}</span>
      {children}
    </label>
  );
}
