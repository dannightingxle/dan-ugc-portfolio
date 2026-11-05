import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isCurrency } from "../currencies";

/* Filling a job in from what the client sent - a brand deal, a retainer's
   new month, any job: Claude reads the brief (and its links, PDFs,
   screenshots and videos) and fills in the job's details. The brief's own
   fields (what to make, the messages, the dos and don'ts, the dates) are set
   from it; what you already know about the job (its contact, its fee) is only
   filled where it's empty; anything unclear comes back as questions. */

const day = z.string().describe("YYYY-MM-DD, or empty if the material doesn't give one");

export const BriefFill = z.object({
  summary: z.string().describe("One line on what this brief asks for, e.g. '4 videos for the Black Friday push, filmed by 20 Nov'"),
  brand: z.string().describe("The brand, only if the job has none yet; otherwise empty"),
  title: z.string().describe("A short title for the job, only if it has none yet (e.g. 'Black Friday - 4 videos'); otherwise empty"),
  product: z.string().describe("What's being featured. Empty if not said"),
  deliverables: z
    .array(
      z.object({
        item: z.string().describe("e.g. 'Video ad', 'Hook variations', 'Raw footage', 'Photos'"),
        qty: z.number().int(),
        format: z.string().describe("9:16, 4:5, 1:1, 16:9, Photo or Raw"),
        length: z.string().describe("e.g. '30s', or empty"),
      }),
    )
    .describe("Everything to make, as the brief lists it. Empty if it doesn't say"),
  keyMessages: z.string().describe("What the brand wants people to take away, as short lines. Empty if not said"),
  dos: z.string().describe("Do's, one a line. Empty if not said"),
  donts: z.string().describe("Don'ts, one a line. Empty if not said"),
  usageRights: z.string().describe("Usage rights, e.g. 'Organic + 3 months paid'. Empty if not said"),
  exclusivity: z.string().describe("Empty if not said"),
  revisions: z.string().describe("Empty if not said"),
  filmBy: day,
  due: day.describe("When the content is due to the brand. YYYY-MM-DD, or empty"),
  goLive: day.describe("When it goes live. YYYY-MM-DD, or empty"),
  fee: z.number().nullable().describe("The fee for this job if the material says it, else null"),
  feeCurrency: z.string().describe("GBP, USD, EUR, AUD or CAD for the fee; empty if no fee"),
  contact: z
    .object({ name: z.string(), role: z.string(), company: z.string(), email: z.string(), phone: z.string(), handle: z.string() })
    .describe("Dan's contact at the brand, as far as the material says (empty strings otherwise)"),
  links: z.array(z.object({ label: z.string(), url: z.string() })).describe("Links worth keeping on the job (brief docs, asset folders, product pages), labelled"),
  todos: z
    .array(z.object({ text: z.string(), dayOffset: z.number().int().nullable().describe("Days from today it's due, or null") }))
    .describe("The few things Dan must do for this job, at most 6 - e.g. order the product, film, send drafts by a date, send the invoice. Not rules (those go in dos and don'ts)"),
  questions: z.array(z.string()).describe("Questions to ask the client about anything unclear or missing, ready to send. Empty if nothing's unclear"),
  notes: z.string().describe("Anything else worth keeping that has no field above, briefly. Empty if none"),
});
export type BriefFill = z.infer<typeof BriefFill>;

type Job = Record<string, unknown> & {
  brand?: string;
  title?: string;
  fee?: number | null;
  feeCurrency?: string;
  contact?: Record<string, string>;
  deliverables?: { id: string; item: string; qty: number; format: string; length: string; done: boolean }[];
  links?: { id: string; label: string; url: string }[];
  notes?: string;
};

const blank = (v: unknown) => v == null || (typeof v === "string" && !v.trim());
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The job with the brief applied, and what changed (in words, for the page). */
export function applyBrief(job: Job, f: BriefFill, today = new Date()): { next: Job; changes: string[] } {
  const next: Job = { ...job };
  const changes: string[] = [];
  const set = (key: string, value: unknown, label: string) => {
    if (JSON.stringify(next[key] ?? "") === JSON.stringify(value)) return;
    next[key] = value;
    changes.push(label);
  };
  if (f.brand.trim() && (blank(job.brand) || job.brand === "New tech job")) set("brand", f.brand.trim(), "brand");
  if (f.title.trim() && blank(job.title)) set("title", f.title.trim(), "title");
  // The brief's own: set from it when it says them (a new month's brief replaces last month's).
  const brief: [keyof BriefFill & string, string][] = [
    ["product", "product"],
    ["keyMessages", "key messages"],
    ["dos", "do's"],
    ["donts", "don'ts"],
    ["usageRights", "usage rights"],
    ["exclusivity", "exclusivity"],
    ["revisions", "revisions"],
  ];
  for (const [key, label] of brief) if (String(f[key]).trim()) set(key, String(f[key]).trim(), label);
  if (f.deliverables.length) {
    // What's to make; anything already ticked off that's still on the list stays ticked.
    const old = job.deliverables ?? [];
    const made = f.deliverables
      .filter((d) => d.item.trim())
      .slice(0, 20)
      .map((d) => {
        const same = old.find((o) => o.item.toLowerCase() === d.item.trim().toLowerCase() && o.format === d.format);
        return { id: same?.id ?? randomUUID(), item: d.item.trim(), qty: Math.max(1, Math.min(99, d.qty || 1)), format: d.format.trim(), length: d.length.trim(), done: same?.done ?? false };
      });
    if (made.length) set("deliverables", made, `${made.length} deliverable${made.length === 1 ? "" : "s"}`);
  }
  for (const [key, label] of [
    ["filmBy", "film by"],
    ["due", "deliver by"],
    ["goLive", "goes live"],
  ] as const) {
    if (isDay(f[key])) set(key, f[key], label);
  }
  // What you already know stays: the fee and contact are only filled where they're empty.
  if (job.fee == null && f.fee != null && f.fee > 0) {
    next.fee = f.fee;
    if (isCurrency(f.feeCurrency)) next.feeCurrency = f.feeCurrency;
    changes.push("fee");
  }
  const contact = { name: "", role: "", company: "", email: "", phone: "", handle: "", ...(job.contact ?? {}) };
  let filled = false;
  for (const k of Object.keys(contact) as (keyof typeof contact)[]) {
    const v = (f.contact as Record<string, string>)[k]?.trim();
    if (v && !contact[k]) {
      contact[k] = v;
      filled = true;
    }
  }
  if (filled) {
    next.contact = contact;
    changes.push("contact");
  }
  const links = [...(job.links ?? [])];
  for (const l of f.links) {
    if (/^https?:\/\//i.test(l.url) && !links.some((x) => x.url === l.url)) links.push({ id: randomUUID(), label: l.label.trim() || "Link", url: l.url.trim() });
  }
  if (links.length > (job.links ?? []).length) {
    next.links = links;
    changes.push(`${links.length - (job.links ?? []).length} link${links.length - (job.links ?? []).length === 1 ? "" : "s"}`);
  }
  // Notes: what's left over and the questions for the client, added under today's date (nothing's overwritten).
  const when = today.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const extra = [f.notes.trim(), f.questions.length ? `Questions for the client:\n${f.questions.map((q) => `- ${q}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  if (extra) {
    next.notes = [String(job.notes ?? "").trim(), `From the brief (${when}):\n${extra}`].filter(Boolean).join("\n\n");
    changes.push("notes");
  }
  return { next, changes };
}
