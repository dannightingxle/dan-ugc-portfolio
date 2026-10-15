"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { STAGES, TECH_STAGES, addExampleProject, newProject, useDataReady, useProjects, type Project } from "../_lib/store";
import { money, shortDate } from "../_lib/ui";
import { useAccount, useFeature } from "../account-provider";
import { CurrencySelect, ExampleTag, Field, PaymentPill, input, parseMoney } from "./fields";

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
  const ready = useDataReady();
  const params = useSearchParams();
  const studio = useFeature("studio");
  // ?new=1 opens the add form; ?new=tech opens it set up for a tech UGC job.
  const [adding, setAdding] = useState(params.get("new") === "1" || params.get("new") === "tech");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl italic sm:text-5xl">Projects</h1>
          <p className="mt-2 text-text-muted">Every brand deal from pitch to paid: the brief, the contact and the money.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {studio && (
            <Link href="/hub/projects/import" className="rounded-xl border border-border px-4 py-2.5 text-sm hover:border-accent hover:text-accent">
              Import
            </Link>
          )}
          <button onClick={() => setAdding(true)} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
            + New project
          </button>
        </div>
      </div>

      {ready && projects.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border-strong bg-bg-card p-5">
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="text-sm text-text-muted">Add one when a brand deal lands, or start with a filled-in example to see how it works.</p>
          </div>
          <button
            type="button"
            onClick={() => addExampleProject()}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Add an example project
          </button>
        </div>
      )}

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

      {adding && <QuickAdd tech={params.get("new") === "tech"} onClose={() => setAdding(false)} />}
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const followups = useFeature("followups");
  const done = p.deliverables.filter((d) => d.done).length;
  const chaseLate = Boolean(p.chaseOn && p.chaseOn <= new Date().toISOString().slice(0, 10));
  return (
    <Link href={`/hub/projects/${p.id}`} className="block space-y-2 rounded-lg border border-border bg-bg-card p-3 transition hover:border-border-strong">
      <div>
        <p className="flex items-center gap-1.5 text-xs text-text-dim">
          {p.brand || "No brand"}
          {p.example && <ExampleTag />}
        </p>
        <p className="text-sm font-medium">{p.title || "Untitled"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
        {p.fee != null && <span className="font-medium text-text">{money(p.fee, p.feeCurrency)}</span>}
        <PaymentPill project={p} />
      </div>
      <div className="flex justify-between text-xs text-text-dim">
        <span>{p.deliverables.length ? `${done}/${p.deliverables.length} deliverables` : ""}</span>
        <span>{p.due ? `Due ${shortDate(p.due)}` : ""}</span>
      </div>
      {p.contact.name && <p className="truncate text-xs text-text-dim">👤 {p.contact.name}</p>}
      {followups && (p.techStage || p.waitingOn || p.platform || p.forGroup) && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {p.techStage && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">Tech · {p.techStage}</span>}
          {p.source === "Platform" && p.platform && <span className="rounded-full bg-text/5 px-2 py-0.5 text-text-muted">{p.platform}</span>}
          {p.forGroup && <span className="rounded-full bg-good-soft px-2 py-0.5 font-medium text-good">For the group</span>}
          {p.waitingOn && (
            <span className={`rounded-full px-2 py-0.5 ${chaseLate ? "bg-warn-soft font-medium text-warn" : "bg-text/5 text-text-dim"}`}>
              Waiting: {p.waitingOn}
              {p.chaseOn && ` · chase ${chaseLate ? "now" : shortDate(p.chaseOn)}`}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

/** The few things you know when a deal lands. Everything else lives on the project page. */
function QuickAdd({ tech, onClose }: { tech: boolean; onClose: () => void }) {
  const { save } = useProjects();
  const router = useRouter();
  const followups = useFeature("followups");
  const studio = useFeature("studio");
  const currency = useAccount().user?.currency ?? "GBP";
  const [p, setP] = useState(() => newProject(tech ? { techStage: "Setup", stage: "Filming", feeCurrency: currency } : { feeCurrency: currency }));
  const [fee, setFee] = useState("");
  const [perDay, setPerDay] = useState("");

  function create(e: React.FormEvent) {
    e.preventDefault();
    const project = p.techStage ? { ...p, perVideo: parseMoney(fee), videosPerDay: parseMoney(perDay) } : { ...p, fee: parseMoney(fee) };
    save(project);
    // A tech job's next step is its Studio: paste the brief and set it up.
    router.push(p.techStage && studio ? `/hub/projects/${project.id}/studio` : `/hub/projects/${project.id}`);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">{p.techStage ? "New tech job" : "New project"}</h2>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="Close">
            ✕
          </button>
        </div>
        <Field label="Brand">
          <input autoFocus required className={input} value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} placeholder={p.techStage ? "e.g. the app's name" : "e.g. Fussy"} />
        </Field>
        <Field label="What's the job?">
          <input
            className={input}
            value={p.title}
            onChange={(e) => setP({ ...p, title: e.target.value })}
            placeholder={p.techStage ? "e.g. 7 videos a week on @account" : "e.g. 3 x video ads for summer launch"}
          />
        </Field>
        {(followups || tech) && (
          <Field label="Tech UGC job?">
            <select className={input} value={p.techStage} onChange={(e) => setP({ ...p, techStage: e.target.value as Project["techStage"] })}>
              <option value="">No - a brand deal</option>
              {TECH_STAGES.map((s) => (
                <option key={s} value={s}>
                  Yes - {s}
                </option>
              ))}
            </select>
          </Field>
        )}
        {p.techStage ? (
          <div className="grid grid-cols-[7rem_1fr_1fr] gap-3">
            <Field label="Currency">
              <CurrencySelect value={p.currency} onChange={(currency) => setP({ ...p, currency })} />
            </Field>
            <Field label="Per video">
              <input className={input} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="20" />
            </Field>
            <Field label="Videos a day">
              <input className={input} inputMode="decimal" value={perDay} onChange={(e) => setPerDay(e.target.value)} placeholder="2" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-[7rem_1fr_1fr] gap-3">
            <Field label="Currency">
              <CurrencySelect value={p.feeCurrency} onChange={(feeCurrency) => setP({ ...p, feeCurrency })} />
            </Field>
            <Field label="Fee">
              <input className={input} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="750" />
            </Field>
            <Field label="Delivery date">
              <input type="date" className={input} value={p.due} onChange={(e) => setP({ ...p, due: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="Stage">
          <select className={input} value={p.stage} onChange={(e) => setP({ ...p, stage: e.target.value as Project["stage"] })}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <button className="w-full rounded-xl bg-accent py-2.5 font-medium text-on-accent hover:bg-accent-hover">
          {p.techStage && studio ? "Create and set it up in Studio →" : "Create and add the brief →"}
        </button>
      </form>
    </div>
  );
}
