"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { STAGES, newProject, useProjects, type Project } from "../_lib/store";
import { gbp, shortDate } from "../_lib/ui";
import { Field, PaymentPill, input, parseMoney } from "./fields";

/* Project board: every brand deal from pitch to paid. */

export default function ProjectsPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}

function Board() {
  const { projects } = useProjects();
  const params = useSearchParams();
  const [adding, setAdding] = useState(params.get("new") === "1");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl italic sm:text-5xl">Projects</h1>
          <p className="mt-2 text-text-muted">Every brand deal from pitch to paid: the brief, the contact and the money.</p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
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
                  <ProjectCard key={p.id} p={p} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const done = p.deliverables.filter((d) => d.done).length;
  return (
    <Link href={`/hub/projects/${p.id}`} className="block space-y-2 rounded-lg border border-border bg-bg-card p-3 transition hover:border-border-strong">
      <div>
        <p className="text-xs text-text-dim">{p.brand || "No brand"}</p>
        <p className="text-sm font-medium">{p.title || "Untitled"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
        {p.fee != null && <span className="font-medium text-text">{gbp(p.fee)}</span>}
        <PaymentPill project={p} />
      </div>
      <div className="flex justify-between text-xs text-text-dim">
        <span>{p.deliverables.length ? `${done}/${p.deliverables.length} deliverables` : ""}</span>
        <span>{p.due ? `Due ${shortDate(p.due)}` : ""}</span>
      </div>
      {p.contact.name && <p className="truncate text-xs text-text-dim">👤 {p.contact.name}</p>}
    </Link>
  );
}

/** The few things you know when a deal lands. Everything else lives on the project page. */
function QuickAdd({ onClose }: { onClose: () => void }) {
  const { save } = useProjects();
  const router = useRouter();
  const [p, setP] = useState(() => newProject());
  const [fee, setFee] = useState("");

  function create(e: React.FormEvent) {
    e.preventDefault();
    const project = { ...p, fee: parseMoney(fee) };
    save(project);
    router.push(`/hub/projects/${project.id}`);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">New project</h2>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="Close">
            ✕
          </button>
        </div>
        <Field label="Brand">
          <input autoFocus required className={input} value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} placeholder="e.g. Fussy" />
        </Field>
        <Field label="What's the job?">
          <input className={input} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="e.g. 3 x video ads for summer launch" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee (£)">
            <input className={input} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="750" />
          </Field>
          <Field label="Delivery date">
            <input type="date" className={input} value={p.due} onChange={(e) => setP({ ...p, due: e.target.value })} />
          </Field>
        </div>
        <Field label="Stage">
          <select className={input} value={p.stage} onChange={(e) => setP({ ...p, stage: e.target.value as Project["stage"] })}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <button className="w-full rounded-xl bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover">Create and add the brief →</button>
      </form>
    </div>
  );
}
