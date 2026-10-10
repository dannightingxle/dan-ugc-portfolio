"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { useAccount } from "../../account-provider";
import {
  PAYMENT_STATUSES,
  SHIPPING,
  STAGES,
  TECH_STAGES,
  paymentDue,
  useDataReady,
  useProjects,
  useSyncStatus,
  useStars,
  type Deliverable,
  type Project,
} from "../../_lib/store";
import { compact, gbp, shortDate } from "../../_lib/ui";
import { Field, PaymentPill, Section, input, parseMoney } from "../fields";

/* One project: dates, payment, contact, the full brief, links and notes.
   Every change saves straight away - there's no save button. */

const FORMATS = ["9:16", "4:5", "1:1", "16:9", "Photo", "Raw"];
const PRESETS: Omit<Deliverable, "id" | "done">[] = [
  { item: "Video ad", qty: 1, format: "9:16", length: "30s" },
  { item: "Hook variations", qty: 3, format: "9:16", length: "3s" },
  { item: "Organic post", qty: 1, format: "9:16", length: "" },
  { item: "Raw footage", qty: 1, format: "Raw", length: "" },
  { item: "Photos", qty: 5, format: "Photo", length: "" },
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { projects, save, remove } = useProjects();
  const router = useRouter();
  const ready = useDataReady();
  const sync = useSyncStatus();
  const { billing } = useAccount();
  const p = projects.find((x) => x.id === id);

  if (!ready) return null;
  if (!p) {
    return (
      <p className="text-text-muted">
        Project not found. <Link href="/hub/projects" className="text-accent">Back to projects</Link>
      </p>
    );
  }
  const project = p;

  function set<K extends keyof Project>(k: K, v: Project[K]) {
    save({ ...project, [k]: v });
  }
  function setContact(k: keyof Project["contact"], v: string) {
    save({ ...project, contact: { ...project.contact, [k]: v } });
  }
  function setPaymentStatus(status: Project["paymentStatus"]) {
    const today = new Date().toISOString().slice(0, 10);
    save({
      ...project,
      paymentStatus: status,
      invoicedOn: status !== "Not invoiced" && !project.invoicedOn ? today : project.invoicedOn,
      paidOn: status === "Paid" && !project.paidOn ? today : project.paidOn,
      stage: status === "Paid" ? "Paid" : project.stage,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/hub/projects" className="text-sm text-text-dim hover:text-text">
          ← Projects
        </Link>
        <span className={`text-xs ${sync === "error" ? "font-medium text-accent" : "text-text-dim"}`}>
          {sync === "saving" ? "Saving…" : sync === "error" ? "Couldn't save - check your connection" : "Saved automatically"}
        </span>
      </div>

      {project.example && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm">
          <p>
            <span className="font-semibold text-accent">Example project.</span> A sample job showing what each section is for. Edit it into a real
            one, or delete it.
          </p>
          <button
            type="button"
            onClick={() => {
              remove(project.id);
              router.push("/hub/projects");
            }}
            className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
          >
            Delete example
          </button>
        </div>
      )}

      <header className="space-y-3">
        <input
          value={project.brand}
          onChange={(e) => set("brand", e.target.value)}
          placeholder="Brand"
          className="w-full bg-transparent text-sm font-medium uppercase tracking-widest text-accent outline-none placeholder:text-text-dim"
        />
        <textarea
          rows={1}
          value={project.title}
          onChange={(e) => set("title", e.target.value.replace(/\n/g, " "))}
          placeholder="What's the job?"
          className="w-full resize-none bg-transparent font-serif text-3xl leading-tight outline-none [field-sizing:content] placeholder:text-text-dim sm:text-4xl"
        />
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stage">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={project.stage === s}
              onClick={() => set("stage", s)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                project.stage === s ? "border-accent bg-accent text-on-accent" : "border-border text-text-muted hover:border-border-strong"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {billing.owner && (
        <Link
          href={`/hub/projects/${project.id}/studio`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 transition hover:border-accent"
        >
          <span>
            <span className="block font-semibold text-accent">Studio</span>
            <span className="text-sm text-text-muted">Brief, app notes, winners and script bank for this job. Weekly shoot sheets and the Friday review.</span>
          </span>
          <span className="text-accent">→</span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Sidebar first on phones: money, dates and contact are what you look up most. */}
        <aside className="space-y-5 lg:order-2">
          {billing.owner && (
            <Section title="Tech job & follow-up">
              <Field label="Tech UGC stage" hint="For a dedicated account posting for an app. Leave as 'Not a tech job' for brand deals.">
                <select className={input} value={project.techStage} onChange={(e) => set("techStage", e.target.value as Project["techStage"])}>
                  <option value="">Not a tech job</option>
                  {TECH_STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pay model">
                <input className={input} value={project.payModel} onChange={(e) => set("payModel", e.target.value)} placeholder="$20/video via SideShift, paid weekly + view bonuses" />
              </Field>
              <Field label="Waiting on" hint="Done only when they've replied or paid.">
                <input className={input} value={project.waitingOn} onChange={(e) => set("waitingOn", e.target.value)} placeholder="Thomas to approve V3, invoice paid…" />
              </Field>
              <Field label="Chase on">
                <input type="date" className={input} value={project.chaseOn} onChange={(e) => set("chaseOn", e.target.value)} />
              </Field>
            </Section>
          )}
          <Section title="Payment" action={<PaymentPill project={project} />}>
            <Field label="Fee (£)">
              <input
                className={`${input} text-lg font-semibold`}
                inputMode="decimal"
                defaultValue={project.fee ?? ""}
                onBlur={(e) => set("fee", parseMoney(e.target.value))}
                placeholder="0"
              />
            </Field>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-bg-elevated p-1">
              {PAYMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPaymentStatus(s)}
                  className={`rounded-md py-1.5 text-xs font-medium transition ${
                    project.paymentStatus === s ? "bg-bg-card text-text shadow-sm" : "text-text-dim hover:text-text"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice no.">
                <input className={input} value={project.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="INV-014" />
              </Field>
              <Field label="Terms (days)">
                <input
                  className={input}
                  inputMode="numeric"
                  value={project.paymentTermsDays ?? ""}
                  onChange={(e) => set("paymentTermsDays", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)}
                />
              </Field>
              <Field label="Invoiced on">
                <input type="date" className={input} value={project.invoicedOn} onChange={(e) => set("invoicedOn", e.target.value)} />
              </Field>
              <Field label="Paid on">
                <input type="date" className={input} value={project.paidOn} onChange={(e) => set("paidOn", e.target.value)} />
              </Field>
            </div>
            <DueLine project={project} />
            <Field label="Payment notes">
              <textarea
                rows={2}
                className={input}
                value={project.paymentNotes}
                onChange={(e) => set("paymentNotes", e.target.value)}
                placeholder="50% upfront, usage fee extra, pay via bank transfer…"
              />
            </Field>
          </Section>

          <Section title="Dates">
            <div className="space-y-2">
              {(
                [
                  ["filmBy", "Film by"],
                  ["due", "Deliver by"],
                  ["goLive", "Goes live"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-text-muted">{label}</span>
                  <input type="date" className={input} value={project[key]} onChange={(e) => set(key, e.target.value)} />
                </label>
              ))}
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input className={input} value={project.contact.name} onChange={(e) => setContact("name", e.target.value)} placeholder="Sarah" />
              </Field>
              <Field label="Role">
                <input className={input} value={project.contact.role} onChange={(e) => setContact("role", e.target.value)} placeholder="Creator manager" />
              </Field>
            </div>
            <Field label="Company / agency">
              <input className={input} value={project.contact.company} onChange={(e) => setContact("company", e.target.value)} placeholder="If booked through an agency" />
            </Field>
            <Field label="Email">
              <input type="email" className={input} value={project.contact.email} onChange={(e) => setContact("email", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone / WhatsApp">
                <input type="tel" className={input} value={project.contact.phone} onChange={(e) => setContact("phone", e.target.value)} />
              </Field>
              <Field label="Instagram / TikTok">
                <input className={input} value={project.contact.handle} onChange={(e) => setContact("handle", e.target.value)} placeholder="@handle" />
              </Field>
            </div>
            <ContactActions contact={project.contact} />
          </Section>

          <LinkedAds project={project} onChange={(ids) => set("adIds", ids)} />
        </aside>

        <div className="min-w-0 space-y-5 lg:order-1">
          <Deliverables items={project.deliverables} onChange={(d) => set("deliverables", d)} />

          <Section title="The brief">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Field label="Product">
                <input className={input} value={project.product} onChange={(e) => set("product", e.target.value)} placeholder="What you're featuring" />
              </Field>
              <Field label="Product shipping">
                <select className={input} value={project.shipping} onChange={(e) => set("shipping", e.target.value as Project["shipping"])}>
                  {SHIPPING.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Key messages / talking points">
              <textarea rows={4} className={input} value={project.keyMessages} onChange={(e) => set("keyMessages", e.target.value)} placeholder="What the brand wants people to take away" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Do's">
                <textarea rows={4} className={input} value={project.dos} onChange={(e) => set("dos", e.target.value)} placeholder="Show the product in the first 3s…" />
              </Field>
              <Field label="Don'ts">
                <textarea rows={4} className={input} value={project.donts} onChange={(e) => set("donts", e.target.value)} placeholder="No competitor mentions…" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Usage rights">
                <input className={input} value={project.usageRights} onChange={(e) => set("usageRights", e.target.value)} placeholder="Paid ads, 3 months, UK" />
              </Field>
              <Field label="Exclusivity">
                <input className={input} value={project.exclusivity} onChange={(e) => set("exclusivity", e.target.value)} placeholder="None / 30 days, category" />
              </Field>
              <Field label="Revisions">
                <input className={input} value={project.revisions} onChange={(e) => set("revisions", e.target.value)} placeholder="2 rounds included" />
              </Field>
            </div>
          </Section>

          <Links items={project.links} onChange={(l) => set("links", l)} />

          <Section title="Notes">
            <textarea
              rows={6}
              className={input}
              value={project.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything else: feedback from the brand, ideas, what went well…"
            />
          </Section>

          <Section title="Script" action={<span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">Scripting tool coming soon</span>}>
            <textarea
              rows={6}
              className={input}
              value={project.script}
              onChange={(e) => set("script", e.target.value)}
              placeholder="Rough script or ideas for now. A proper script and shot-list builder is on the way."
            />
          </Section>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete "${project.title || project.brand || "this project"}"? This can't be undone.`)) {
                  remove(project.id);
                  router.push("/hub/projects");
                }
              }}
              className="text-sm text-text-dim hover:text-accent"
            >
              Delete project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DueLine({ project }: { project: Project }) {
  const due = paymentDue(project);
  if (project.paymentStatus === "Paid") {
    return <p className="text-sm text-good">Paid {project.paidOn ? shortDate(project.paidOn) : ""} ✓</p>;
  }
  if (!due) return null;
  return (
    <p className={`text-sm ${due.overdue ? "font-medium text-accent" : "text-text-muted"}`}>
      {due.overdue ? "Overdue - was due" : "Payment due"} {shortDate(due.date)}
    </p>
  );
}

function ContactActions({ contact }: { contact: Project["contact"] }) {
  const handle = contact.handle.replace(/^@/, "").trim();
  const phone = contact.phone.replace(/[^\d+]/g, "");
  const actions = [
    contact.email && { label: "Email", href: `mailto:${contact.email}` },
    phone && { label: "Call", href: `tel:${phone}` },
    phone && { label: "WhatsApp", href: `https://wa.me/${phone.replace(/^\+/, "").replace(/^0/, "44")}` },
    handle && { label: "Instagram", href: `https://instagram.com/${handle}` },
  ].filter(Boolean) as { label: string; href: string }[];
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <a
          key={a.label}
          href={a.href}
          target={a.href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent hover:text-accent"
        >
          {a.label}
        </a>
      ))}
    </div>
  );
}

function Deliverables({ items, onChange }: { items: Deliverable[]; onChange: (d: Deliverable[]) => void }) {
  const done = items.filter((d) => d.done).length;
  const update = (id: string, patch: Partial<Deliverable>) => onChange(items.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const add = (d: Omit<Deliverable, "id" | "done">) => onChange([...items, { ...d, id: crypto.randomUUID(), done: false }]);

  return (
    <Section title="Deliverables" action={items.length ? <span className="text-sm text-text-dim">{done}/{items.length} done</span> : undefined}>
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg p-2 sm:flex-nowrap">
              <input
                type="checkbox"
                checked={d.done}
                onChange={(e) => update(d.id, { done: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                aria-label="Done"
              />
              <input
                className="w-12 shrink-0 rounded-md border border-border bg-bg-card px-2 py-1 text-center text-sm outline-none focus:border-accent"
                inputMode="numeric"
                value={d.qty}
                onChange={(e) => update(d.id, { qty: Number(e.target.value.replace(/\D/g, "")) || 1 })}
                aria-label="Quantity"
              />
              <span className="text-text-dim">×</span>
              <input
                className={`min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm outline-none focus:bg-bg-card ${d.done ? "text-text-dim line-through" : ""}`}
                value={d.item}
                onChange={(e) => update(d.id, { item: e.target.value })}
                placeholder="What is it?"
                aria-label="Deliverable"
              />
              <select
                className="rounded-md border border-border bg-bg-card px-2 py-1 text-xs outline-none"
                value={d.format}
                onChange={(e) => update(d.id, { format: e.target.value })}
                aria-label="Format"
              >
                {FORMATS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <input
                className="w-16 rounded-md border border-border bg-bg-card px-2 py-1 text-xs outline-none focus:border-accent"
                value={d.length}
                onChange={(e) => update(d.id, { length: e.target.value })}
                placeholder="Length"
                aria-label="Length"
              />
              <button type="button" onClick={() => onChange(items.filter((x) => x.id !== d.id))} className="px-1 text-text-dim hover:text-accent" aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.item} type="button" onClick={() => add(p)} className="rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-text-muted hover:border-accent hover:text-accent">
            + {p.item}
          </button>
        ))}
        <button
          type="button"
          onClick={() => add({ item: "", qty: 1, format: "9:16", length: "" })}
          className="rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          + Custom
        </button>
      </div>
    </Section>
  );
}

/** Name a link after where it points, so a pasted URL is labelled for you. */
function guessLabel(url: string) {
  const host = url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  const known: [RegExp, string][] = [
    [/notion\./, "Notion"],
    [/docs\.google/, "Google Doc"],
    [/drive\.google/, "Google Drive"],
    [/dropbox/, "Dropbox"],
    [/frame\.io/, "Frame.io"],
    [/wetransfer|we\.tl/, "WeTransfer"],
    [/canva/, "Canva"],
    [/figma/, "Figma"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host;
}

function Links({ items, onChange }: { items: Project["links"]; onChange: (l: Project["links"]) => void }) {
  const update = (id: string, patch: Partial<Project["links"][number]>) => onChange(items.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <Section title="Links">
      <p className="-mt-2 text-sm text-text-dim">Notion boards, brief docs, Drive folders, the product page… paste a link and it&apos;s labelled for you.</p>
      {items.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          <input className={`${input} !w-28 shrink-0 sm:!w-36`} value={l.label} onChange={(e) => update(l.id, { label: e.target.value })} placeholder="Label" aria-label="Label" />
          <input
            className={input}
            value={l.url}
            onChange={(e) => update(l.id, { url: e.target.value })}
            onBlur={() => !l.label && l.url && update(l.id, { label: guessLabel(l.url) })}
            placeholder="https://"
            aria-label="URL"
          />
          {l.url && (
            <a
              href={/^https?:\/\//.test(l.url) ? l.url : `https://${l.url}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-border px-2.5 py-2 text-sm hover:border-accent hover:text-accent"
              aria-label="Open link"
            >
              ↗
            </a>
          )}
          <button type="button" onClick={() => onChange(items.filter((x) => x.id !== l.id))} className="shrink-0 px-1 text-text-dim hover:text-accent" aria-label="Remove link">
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), label: "", url: "" }])}
        className="rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-text-muted hover:border-accent hover:text-accent"
      >
        + Add link
      </button>
    </Section>
  );
}

function LinkedAds({ project, onChange }: { project: Project; onChange: (ids: string[]) => void }) {
  const { stars } = useStars();
  const ads = Object.values(stars);
  return (
    <Section title="Live ads">
      {ads.length === 0 ? (
        <p className="text-sm text-text-dim">
          When the ads go live, star them in{" "}
          <Link href="/hub/find" className="text-accent">
            Find ads
          </Link>{" "}
          and link them here.
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {ads.map((ad) => (
            <label key={ad.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-elevated">
              <input
                type="checkbox"
                checked={project.adIds.includes(ad.id)}
                onChange={(e) => onChange(e.target.checked ? [...project.adIds, ad.id] : project.adIds.filter((x) => x !== ad.id))}
                className="accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-text-dim">{ad.brandName} · </span>
                {ad.title}
              </span>
              <span className="text-xs text-text-dim">{compact(ad.reach)}</span>
            </label>
          ))}
        </div>
      )}
      {project.fee != null && project.adIds.length > 0 && (
        <p className="text-xs text-text-dim">
          {gbp(project.fee)} fee · {compact(ads.filter((a) => project.adIds.includes(a.id)).reduce((s, a) => s + (a.reach ?? 0), 0))} reach so far
        </p>
      )}
    </Section>
  );
}
