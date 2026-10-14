import { CURRENCIES, PAYMENT_STATUSES, STAGES, TECH_STAGES, newProject, type Deliverable, type Project } from "./store";

/* Bringing jobs in from elsewhere (a Claude chat, an email trawl) as JSON.
   Matches each job to one already on the board by id or brand, and only fills
   what's empty - nothing typed into Creator Desk is ever overwritten. Notes
   are the exception: new notes are added underneath the old ones. */

type Raw = Record<string, unknown>;

export type ImportedFiles = {
  instructions: string;
  brief: string;
  appNotes: string;
  references: string;
  winners: string;
  scriptBank: string;
  accountHandles: string;
  accountNotes: string;
  clientQuestions: string[];
};

export type PlanItem = { brand: string; isNew: boolean; project: Project; changed: string[]; files: ImportedFiles };

const FORMATS = ["9:16", "4:5", "1:1", "16:9", "Photo", "Raw"];

const str = (v: unknown, max = 400_000) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const day = (v: unknown) => {
  const s = str(v, 40);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 2_000)).filter(Boolean).slice(0, 50) : []);
const pick = <T extends string>(v: unknown, options: readonly T[]) => options.find((o) => o.toLowerCase() === str(v, 40).toLowerCase());

/** Pull the jobs out of pasted text: a JSON array, {jobs: [...]}, or JSON inside ```code fences (even split across replies). */
export function parseJobs(text: string): Raw[] {
  const body = text.replace(/^\s*```[a-z]*\s*$/gim, "");
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
  if (start < 0) throw new Error("No JSON found - paste the whole reply, including the [ ... ] part.");
  let data: unknown;
  try {
    data = JSON.parse(body.slice(start, end < start ? undefined : end + 1));
  } catch {
    throw new Error("That JSON is cut off or broken. If the reply was split, paste every part, in order.");
  }
  const jobs = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as Raw).jobs) ? (data as Raw).jobs : [data];
  return (jobs as unknown[]).filter((j): j is Raw => Boolean(j) && typeof j === "object" && Boolean(str((j as Raw).brand) || str((j as Raw).job)));
}

/** "TVA (The Viral App)" and "tva" are the same brand. */
export function brandKey(brand: string) {
  return brand
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stageFor(job: Raw, techStage: Project["techStage"], paymentStatus: Project["paymentStatus"] | undefined): Project["stage"] {
  const s = str(job.stage, 40).toLowerCase();
  const exact = pick(job.stage, STAGES);
  if (exact) return exact;
  if (/invoic/.test(s)) return "Delivered";
  if (/enquir|offer|negotiat|pitch|quote/.test(s)) return "Pitched";
  if (/production|shoot|film/.test(s)) return "Filming";
  if (paymentStatus === "Paid") return "Paid";
  if (paymentStatus === "Invoiced") return "Delivered";
  if (techStage === "Active" || techStage === "Warm-up") return "Filming";
  if (techStage === "Setup" || techStage === "Account creation" || techStage === "On hold") return "Briefed";
  return "Pitched";
}

/** Everything the job carries, as project fields (unknown ones left out). */
function fieldsFrom(job: Raw): { fields: Partial<Project>; files: ImportedFiles } {
  const f: Partial<Project> = {};
  const set = <K extends keyof Project>(k: K, v: Project[K] | "" | null | undefined) => {
    if (v !== "" && v != null) f[k] = v as Project[K];
  };
  const techStage = pick(job.techStage, TECH_STAGES) ?? (str(job.techStage).toLowerCase() === "on hold" ? "On hold" : undefined);
  const paymentStatus = pick(job.paymentStatus, PAYMENT_STATUSES) ?? (str(job.stage).toLowerCase() === "invoiced" ? "Invoiced" : undefined);
  const tech = Boolean(techStage) || str(job.kind).toLowerCase() === "tech";

  set("brand", str(job.brand, 200) || str(job.job, 200));
  set("title", str(job.title, 300));
  set("stage", stageFor(job, techStage ?? "", paymentStatus));
  set("techStage", techStage ?? (tech ? "Setup" : undefined));
  set("paymentStatus", paymentStatus);

  // The board's fee is in pounds; other currencies are kept in the payment notes instead.
  const currency = pick(job.currency, CURRENCIES) ?? (str(job.currency) ? undefined : "GBP");
  const fee = num(job.fee);
  const notes: string[] = [];
  if (fee != null && currency === "GBP") set("fee", fee);
  else if (fee != null) notes.push(`Fee: ${fee} ${str(job.currency, 10) || "(currency unknown)"}`);
  const perVideo = num(job.perVideo);
  if (perVideo != null && currency) {
    set("perVideo", perVideo);
    set("currency", currency);
  } else if (perVideo != null) notes.push(`Per video: ${perVideo} ${str(job.currency, 10)}`);
  set("videosPerDay", num(job.videosPerDay));
  set("payModel", str(job.payNotes, 2_000) || str(job.payModel, 2_000));
  set("invoiceNumber", str(job.invoiceNumber, 100));
  set("invoicedOn", day(job.invoicedOn));
  set("paidOn", day(job.paidOn));
  set("paymentTermsDays", num(job.paymentTermsDays));
  if (notes.length) set("paymentNotes", notes.join("\n"));

  set("filmBy", day(job.filmBy));
  set("due", day(job.due));
  set("goLive", day(job.goLive));
  set("chaseOn", day(job.chaseOn));
  for (const k of ["product", "usageRights", "exclusivity", "revisions", "keyMessages", "dos", "donts"] as const) set(k, str(job[k], 20_000));

  const c = (job.contact && typeof job.contact === "object" ? job.contact : {}) as Raw;
  const contact = { name: str(c.name, 200), role: str(c.role, 200), company: str(c.company, 200), email: str(c.email, 200), phone: str(c.phone, 100), handle: str(c.handle, 200) };
  if (Object.values(contact).some(Boolean)) f.contact = contact;

  const links = (Array.isArray(job.links) ? job.links : [])
    .map((l) => l as Raw)
    .filter((l) => /^https?:\/\//.test(str(l?.url, 2_000)))
    .slice(0, 30)
    .map((l) => ({ id: crypto.randomUUID(), label: str(l.label, 200) || str(l.url, 200), url: str(l.url, 2_000) }));
  if (links.length) f.links = links;

  const deliverables: Deliverable[] = (Array.isArray(job.deliverables) ? job.deliverables : [])
    .map((d) => d as Raw)
    .filter((d) => str(d?.item, 300))
    .slice(0, 30)
    .map((d) => {
      const format = FORMATS.find((x) => x.toLowerCase() === str(d.format, 20).toLowerCase());
      const item = str(d.item, 300);
      return { id: crypto.randomUUID(), item: format || !str(d.format) ? item : `${item} (${str(d.format, 40)})`, qty: Math.max(1, Math.round(num(d.qty) ?? 1)), format: format ?? "9:16", length: str(d.length, 40), done: false };
    });
  if (deliverables.length) f.deliverables = deliverables;

  // "Waiting on" is for someone else's move; anything Dan owes goes in the notes as a to-do.
  const waiting = str(job.waitingOn, 500);
  const status = str(job.notes, 5_000) || str(job.status, 5_000);
  const own = /^(nobody|none|n\/a|no one|dan\b|me\b|i\b)/i.test(waiting);
  if (waiting && !own) set("waitingOn", waiting);
  set("notes", [status, own ? `To do: ${waiting.replace(/^(nobody|none|no one)\s*[-:,.]?\s*/i, "")}` : ""].filter(Boolean).join("\n"));

  const files: ImportedFiles = {
    instructions: str(job.instructions, 50_000),
    brief: str(job.brief),
    appNotes: str(job.appNotes),
    references: str(job.references),
    winners: str(job.winners),
    scriptBank: str(job.scriptBank),
    accountHandles: str(job.accountHandles, 2_000),
    accountNotes: str(job.accountNotes, 10_000),
    clientQuestions: list(job.openQuestions ?? job.clientQuestions),
  };
  return { fields: f, files };
}

const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Fill an existing project's gaps from an import, saying which fields changed. */
function fill(existing: Project, incoming: Partial<Project>): { project: Project; changed: string[] } {
  const p: Project = { ...existing, contact: { ...existing.contact } };
  const changed: string[] = [];
  for (const [k, v] of Object.entries(incoming) as [keyof Project, Project[keyof Project]][]) {
    if (k === "brand" || empty(v)) continue;
    if (k === "contact") {
      const c = v as Project["contact"];
      for (const ck of Object.keys(c) as (keyof Project["contact"])[]) {
        if (c[ck] && !p.contact[ck]) {
          p.contact[ck] = c[ck];
          if (!changed.includes("contact")) changed.push("contact");
        }
      }
    } else if (k === "links") {
      const add = (v as Project["links"]).filter((l) => !p.links.some((x) => x.url === l.url));
      if (add.length) {
        p.links = [...p.links, ...add];
        changed.push(k);
      }
    } else if (k === "notes" || k === "paymentNotes") {
      const text = v as string;
      if (p[k].includes(text)) continue;
      p[k] = p[k] && !p[k].startsWith("From Notion:") ? `${p[k]}\n\n${text}` : text;
      changed.push(k);
    } else if (k === "stage" || k === "paymentStatus" || k === "currency") {
      // Only move on from the defaults (a new project's stage, not invoiced, a rate not yet set).
      const isDefault = k === "stage" ? p.stage === "Pitched" : k === "paymentStatus" ? p.paymentStatus === "Not invoiced" : existing.perVideo == null;
      if (isDefault && p[k] !== v) {
        (p as Record<string, unknown>)[k] = v;
        changed.push(k);
      }
    } else if (empty(p[k])) {
      (p as Record<string, unknown>)[k] = v;
      changed.push(k);
    }
  }
  return { project: p, changed };
}

/** Work out what an import will do, without saving anything. */
export function planImport(existing: Project[], jobs: Raw[]): PlanItem[] {
  const used = new Set<string>();
  const byBrand = (key: string) => existing.filter((p) => brandKey(p.brand) === key && !used.has(p.id));
  const incomingCount = new Map<string, number>();
  for (const j of jobs) {
    const key = brandKey(str(j.brand) || str(j.job));
    incomingCount.set(key, (incomingCount.get(key) ?? 0) + 1);
  }

  return jobs.map((job) => {
    const { fields, files } = fieldsFrom(job);
    const key = brandKey(fields.brand ?? "");
    const id = str(job.id, 80);
    // Same id, else the only job for that brand on both sides, else the same brand and title.
    let match = (id && existing.find((p) => p.id === id && !used.has(p.id))) || undefined;
    if (!match) {
      const same = byBrand(key);
      if (same.length === 1 && incomingCount.get(key) === 1) match = same[0];
      else match = same.find((p) => brandKey(p.title) === brandKey(fields.title ?? "") && Boolean(p.title));
    }
    if (match) {
      used.add(match.id);
      return { brand: match.brand, isNew: false, ...fill(match, fields), files };
    }
    const project = newProject({ ...fields, ...(id && /^[\w-]{1,80}$/.test(id) ? { id } : {}) });
    used.add(project.id);
    return { brand: project.brand, isNew: true, project, changed: [], files };
  });
}

/** Studio fields from an import that would fill gaps in a job's workspace. */
export function hasFiles(f: ImportedFiles) {
  return Object.values(f).some((v) => !empty(v));
}
