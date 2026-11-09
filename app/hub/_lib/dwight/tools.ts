import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminClient } from "../supabase/admin";
import type { HubUser } from "../supabase/server";
import { canUse } from "../features";
import { CURRENCIES } from "../currencies";
import { PAYMENT_STATUSES, SHIPPING, SOURCES, STAGES, TECH_STAGES } from "../job-fields";
import { getTodos, saveTodos } from "../todos/data";
import { REPEATS, finish, localDay, type Todo } from "../todos/types";
import { bufferCalendar, bufferStatus, jobChannels } from "../buffer/data";
import { listSheets } from "../studio/data";
import { listScripts } from "../scripts/data";
import { contentNeeded } from "./plan";
import type { UndoRecord } from "./data";
import { type DwightLink, isHubLink } from "./types";

/* What Dwight can do. Each tool is checked (its input against a schema, and
   only ever on the signed-in person's own data), says in words what it
   changed, and keeps what it changed as it was before so the change can be
   undone. Nothing is ever deleted, and nothing that costs Claude credits or
   posts anywhere is started here: those become a button for you to press. */

type Job = Record<string, unknown> & { id: string; brand?: string; title?: string };

export type ToolContext = {
  user: HubUser;
  today: string;
  changes: string[];
  links: DwightLink[];
  undo: Pick<UndoRecord, "jobs" | "todos">;
  /** Jobs changed or added, for the page to reload. */
  jobsTouched: Set<string>;
  todosTouched: boolean;
};

const day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "a date as YYYY-MM-DD, or empty");
const text = (max = 5_000) => z.string().max(max);

/** The fields Dwight can set on a job (anything else stays as it is). */
const JobFields = z
  .object({
    brand: text(200),
    title: text(300),
    stage: z.enum(STAGES).describe("Brand deals move through these. Lost = didn't happen"),
    techStage: z.enum(["", ...TECH_STAGES]).describe("Only for tech UGC jobs (an account posting for an app); empty for brand deals"),
    filmBy: day,
    due: day.describe("When the content is due to the brand"),
    goLive: day,
    fee: z.number().nullable(),
    feeCurrency: z.enum(CURRENCIES),
    paymentStatus: z.enum(PAYMENT_STATUSES),
    invoiceNumber: text(100),
    invoicedOn: day,
    paidOn: day,
    paymentTermsDays: z.number().int().nullable(),
    paymentNotes: text(),
    contact: z.object({ name: text(200), role: text(200), company: text(200), email: text(200), phone: text(100), handle: text(200) }).partial(),
    product: text(1_000),
    shipping: z.enum(SHIPPING),
    usageRights: text(1_000),
    exclusivity: text(1_000),
    revisions: text(500),
    keyMessages: text(),
    dos: text(),
    donts: text(),
    waitingOn: text(500).describe("Tech jobs: what you're waiting on from them"),
    chaseOn: day.describe("When to chase if they haven't replied"),
    payModel: text(500),
    perVideo: z.number().nullable().describe("Tech jobs: pay per video"),
    currency: z.enum(CURRENCIES).describe("Tech jobs: the currency of perVideo"),
    videosPerDay: z.number().nullable().describe("Tech jobs: videos a day the job needs"),
    source: z.enum(["", ...SOURCES]),
    platform: text(200),
    lastContact: day,
    deliverables: z
      .array(z.object({ item: text(200), qty: z.number().int().min(1).max(99), format: text(50), length: text(50), done: z.boolean() }))
      .max(30)
      .describe("Replaces the list"),
  })
  .partial();

const LABEL: Record<string, string> = {
  brand: "brand",
  title: "title",
  stage: "stage",
  techStage: "tech stage",
  filmBy: "film by",
  due: "due",
  goLive: "goes live",
  fee: "fee",
  feeCurrency: "fee currency",
  paymentStatus: "payment",
  invoiceNumber: "invoice number",
  invoicedOn: "invoiced on",
  paidOn: "paid on",
  paymentTermsDays: "payment terms",
  paymentNotes: "payment notes",
  contact: "contact",
  product: "product",
  shipping: "shipping",
  usageRights: "usage rights",
  exclusivity: "exclusivity",
  revisions: "revisions",
  keyMessages: "key messages",
  dos: "do's",
  donts: "don'ts",
  waitingOn: "waiting on",
  chaseOn: "chase on",
  payModel: "pay model",
  perVideo: "per video",
  currency: "currency",
  videosPerDay: "videos a day",
  source: "source",
  platform: "platform",
  lastContact: "last contact",
  deliverables: "deliverables",
  notes: "notes",
  links: "links",
};

const shortDay = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : d;
function said(key: string, v: unknown) {
  if (v === "" || v == null) return `${LABEL[key] ?? key} cleared`;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${LABEL[key] ?? key} ${shortDay(v)}`;
  if (typeof v === "string" || typeof v === "number") return `${LABEL[key] ?? key} ${String(v).length > 40 ? "updated" : v}`;
  return `${LABEL[key] ?? key} updated`;
}
const jobName = (j: Job) => String(j.brand || j.title || "Untitled job");
const jobLink = (id: string) => `/hub/projects/${id}`;

async function loadJobs(userId: string): Promise<Job[]> {
  const { data, error } = await adminClient().from("hub_projects").select("id, data").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r.data as Job), id: r.id as string }));
}
async function loadJob(userId: string, id: string): Promise<Job> {
  const { data } = await adminClient().from("hub_projects").select("data").eq("user_id", userId).eq("id", id).maybeSingle<{ data: Job }>();
  if (!data) throw new Error(`There's no job with id ${id}. Use list_jobs to find it.`);
  return { ...data.data, id };
}
async function writeJob(ctx: ToolContext, job: Job, before: Job | null) {
  if (!ctx.undo.jobs.some((j) => j.id === job.id)) ctx.undo.jobs.push({ id: job.id, before });
  const now = new Date().toISOString();
  const { error } = before
    ? await adminClient().from("hub_projects").update({ data: job, updated_at: now }).eq("user_id", ctx.user.id).eq("id", job.id)
    : await adminClient().from("hub_projects").insert({ user_id: ctx.user.id, id: job.id, data: job, updated_at: now });
  if (error) throw error;
  ctx.jobsTouched.add(job.id);
}

const archived = (j: Job) => j.stage === "Lost" || j.techStage === "Lost" || j.techStage === "Ended";

/** A job in a line or two, for lists. */
function summary(j: Job) {
  const tech = Boolean(j.techStage);
  return {
    id: j.id,
    link: jobLink(j.id),
    brand: j.brand ?? "",
    title: j.title ?? "",
    kind: tech ? "tech UGC job" : "brand deal",
    stage: tech ? j.techStage : j.stage,
    ...(tech
      ? {
          videosPerDay: j.videosPerDay ?? null,
          perVideo: j.perVideo ?? null,
          currency: j.currency,
          waitingOn: j.waitingOn || undefined,
          chaseOn: j.chaseOn || undefined,
        }
      : {}),
    ...(!tech
      ? {
          filmBy: j.filmBy || undefined,
          due: j.due || undefined,
          fee: j.fee ?? null,
          feeCurrency: j.feeCurrency,
          paymentStatus: j.paymentStatus,
          invoicedOn: j.invoicedOn || undefined,
          paidOn: j.paidOn || undefined,
        }
      : {}),
    retainerNext: (j.repeat as { next?: string } | null)?.next || undefined,
    example: j.example || undefined,
  };
}

type Tool = {
  name: string;
  description: string;
  input: z.ZodType;
  /** Shown while it runs. */
  step: string;
  feature?: Parameters<typeof canUse>[1];
  run: (ctx: ToolContext, input: never) => Promise<unknown>;
};

const TOOLS: Tool[] = [
  {
    name: "list_jobs",
    step: "Looking at your jobs",
    description: "Every job (brand deals and tech UGC jobs) with its stage, dates and payment. Finished and lost ones only if asked for.",
    input: z.object({ include_finished: z.boolean().default(false) }),
    run: async (ctx, { include_finished }: { include_finished: boolean }) =>
      (await loadJobs(ctx.user.id)).filter((j) => include_finished || !archived(j)).map(summary),
  },
  {
    name: "get_job",
    step: "Opening the job",
    description: "Everything on one job: contact, brief, deliverables, payment, notes, links.",
    input: z.object({ job_id: z.string() }),
    run: async (ctx, { job_id }: { job_id: string }) => {
      const j = await loadJob(ctx.user.id, job_id);
      const { script, adIds, ...rest } = j;
      void adIds;
      return { ...rest, link: jobLink(j.id), script: typeof script === "string" && script.length > 2000 ? `${script.slice(0, 2000)}…` : script };
    },
  },
  {
    name: "update_job",
    step: "Updating the job",
    description:
      "Change fields on a job. Only the fields given change. Paid brand deal: paymentStatus Paid, paidOn the date, stage Paid. Use append_notes to add to its notes (never overwrite them) and add_links for links.",
    input: z.object({
      job_id: z.string(),
      changes: JobFields,
      append_notes: text().optional(),
      add_links: z
        .array(z.object({ label: text(200), url: z.string().url() }))
        .max(10)
        .optional(),
    }),
    run: async (ctx, input: { job_id: string; changes: z.infer<typeof JobFields>; append_notes?: string; add_links?: { label: string; url: string }[] }) => {
      const before = await loadJob(ctx.user.id, input.job_id);
      const next: Job = { ...before };
      const words: string[] = [];
      for (const [k, v] of Object.entries(input.changes)) {
        if (k === "contact") {
          next.contact = { ...((before.contact as object) ?? {}), ...(v as object) };
        } else if (k === "deliverables") {
          next.deliverables = (v as { item: string }[]).map((d) => ({ id: randomUUID(), ...d }));
        } else next[k] = v;
        if (JSON.stringify(before[k] ?? "") !== JSON.stringify(next[k] ?? "")) words.push(said(k, v));
      }
      if (input.append_notes?.trim()) {
        next.notes = [String(before.notes ?? "").trim(), input.append_notes.trim()].filter(Boolean).join("\n\n");
        words.push("notes added to");
      }
      if (input.add_links?.length) {
        const links = [...((before.links as { url: string }[]) ?? [])];
        for (const l of input.add_links)
          if (!links.some((x) => x.url === l.url)) links.push({ id: randomUUID(), label: l.label || "Link", url: l.url } as never);
        next.links = links;
        words.push(`${input.add_links.length} link${input.add_links.length === 1 ? "" : "s"} added`);
      }
      if (!words.length) return { changed: false, note: "Nothing was different, so nothing changed." };
      await writeJob(ctx, next, before);
      ctx.changes.push(`${jobName(next)}: ${words.join(", ")}`);
      return { changed: true, job: summary(next) };
    },
  },
  {
    name: "create_job",
    step: "Adding the job",
    description:
      "Add a new job from what you're given (a pasted brief, email or message). Brand deals start in stage Briefed unless said otherwise; tech UGC jobs set techStage. Put anything without a field in notes. Check list_jobs first so you don't add one that's already there.",
    input: z.object({
      fields: JobFields.extend({ brand: text(200).min(1) }),
      notes: text(20_000).optional(),
      links: z
        .array(z.object({ label: text(200), url: z.string().url() }))
        .max(10)
        .optional(),
    }),
    run: async (ctx, input: { fields: z.infer<typeof JobFields> & { brand: string }; notes?: string; links?: { label: string; url: string }[] }) => {
      const id = randomUUID();
      const { contact, deliverables, ...rest } = input.fields;
      const job: Job = {
        id,
        createdAt: new Date().toISOString(),
        stage: "Briefed",
        ...rest,
        contact: { name: "", role: "", company: "", email: "", phone: "", handle: "", ...(contact ?? {}) },
        deliverables: (deliverables ?? []).map((d) => ({ id: randomUUID(), ...d })),
        links: (input.links ?? []).map((l) => ({ id: randomUUID(), label: l.label || "Link", url: l.url })),
        notes: input.notes?.trim() ?? "",
      };
      await writeJob(ctx, job, null);
      ctx.changes.push(`Added ${jobName(job)}${job.title ? ` - ${job.title}` : ""}`);
      return { created: true, job: summary(job) };
    },
  },
  {
    name: "list_todos",
    step: "Looking at your to-dos",
    feature: "todos",
    description: "Your to-dos: open ones (and recently done ones if asked), with the job each is for.",
    input: z.object({ include_done: z.boolean().default(false) }),
    run: async (ctx, { include_done }: { include_done: boolean }) => {
      const [todos, jobs] = await Promise.all([getTodos(ctx.user.id), loadJobs(ctx.user.id)]);
      return todos
        .filter((t) => include_done || !t.doneAt || t.repeat)
        .map((t) => ({
          id: t.id,
          text: t.text,
          job: jobs.find((j) => j.id === t.projectId)?.brand,
          due: t.due || undefined,
          repeat: t.repeat || undefined,
          left: t.left ?? undefined,
          waitingForApproval: Boolean(t.submittedAt) || undefined,
          done: Boolean(t.doneAt) || undefined,
        }));
    },
  },
  {
    name: "add_todo",
    step: "Adding a to-do",
    feature: "todos",
    description: "Add a to-do, optionally for a job, with a date and a repeat.",
    input: z.object({ text: text(300).min(1), due: day.default(""), job_id: z.string().default(""), repeat: z.enum(REPEATS).default("") }),
    run: async (ctx, input: { text: string; due: string; job_id: string; repeat: Todo["repeat"] }) => {
      const todos = await getTodos(ctx.user.id);
      const t: Todo = {
        id: randomUUID(),
        text: input.text.trim(),
        projectId: input.job_id,
        repeat: input.repeat,
        due: input.due,
        count: null,
        left: null,
        submittedAt: "",
        doneAt: "",
        prevDue: "",
        createdAt: new Date().toISOString(),
      };
      ctx.undo.todos.push({ id: t.id, before: null });
      await saveTodos(ctx.user.id, [...todos, t]);
      ctx.todosTouched = true;
      ctx.changes.push(`To-do added: ${t.text}${t.due ? ` (by ${shortDay(t.due)})` : ""}`);
      return { added: t.id };
    },
  },
  {
    name: "complete_todo",
    step: "Ticking off a to-do",
    feature: "todos",
    description: "Tick a to-do off (a repeating one moves to its next date).",
    input: z.object({ todo_id: z.string() }),
    run: async (ctx, { todo_id }: { todo_id: string }) => {
      const todos = await getTodos(ctx.user.id);
      const t = todos.find((x) => x.id === todo_id);
      if (!t) throw new Error("That to-do isn't there. Use list_todos.");
      if (!ctx.undo.todos.some((u) => u.id === t.id)) ctx.undo.todos.push({ id: t.id, before: t });
      await saveTodos(
        ctx.user.id,
        todos.map((x) => (x.id === t.id ? { ...x, ...finish(x, ctx.today) } : x)),
      );
      ctx.todosTouched = true;
      ctx.changes.push(`Ticked off: ${t.text}`);
      return { done: true };
    },
  },
  {
    name: "content_needed",
    step: "Working out how many videos you need",
    description:
      "For each live tech UGC job (Active or Warm-up): how many videos it needs from today up to a date (its videos a day x the days), what's already scheduled on its Buffer accounts, and how many are still to make. The pace is the job's own videos a day; what Buffer has actually been posting is beside it (bufferPerDay), used when the job has none, and paceNote says when they disagree. Use it for 'how much do I need to make before X'.",
    input: z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    run: async (ctx, { until }: { until: string }) => {
      const [jobs, connected] = await Promise.all([
        loadJobs(ctx.user.id),
        (await canUse(ctx.user, "calendar"))
          ? bufferStatus(ctx.user.id)
              .then((s) => s.connected)
              .catch(() => false)
          : false,
      ]);
      const cal = connected ? await bufferCalendar(ctx.user.id).catch(() => null) : null;
      const finished: Record<string, number> = {};
      if (await canUse(ctx.user, "edits")) {
        const { data } = await adminClient()
          .from("hub_edits")
          .select("project_id, status")
          .eq("user_id", ctx.user.id)
          .in("status", ["ready", "done"])
          .gt("updated_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
        for (const r of data ?? []) finished[r.project_id as string] = (finished[r.project_id as string] ?? 0) + 1;
      }
      const needs = contentNeeded({
        jobs: jobs.map((j) => ({
          id: j.id,
          brand: String(j.brand ?? ""),
          title: String(j.title ?? ""),
          techStage: String(j.techStage ?? ""),
          videosPerDay: (j.videosPerDay as number | null) ?? null,
        })),
        today: ctx.today,
        until,
        channels: cal?.channels ?? null,
        scheduled: cal?.scheduled ?? [],
        sent: cal?.sent ?? [],
        jobChannels: connected ? await jobChannels(ctx.user.id) : {},
        finishedEdits: finished,
      });
      return {
        from: ctx.today,
        until,
        bufferChecked: cal?.at ?? null,
        jobs: needs.map((n) => ({
          ...n,
          link: jobLink(n.jobId),
          makeSheet: `/hub/projects/${n.jobId}/studio?tab=week${n.toMake ? `&videos=${Math.min(21, n.toMake)}` : ""}`,
        })),
        note: "A shoot sheet holds up to 21 videos: more than that is 2 sheets. makeSheet opens this week's shoot sheet with the number filled in.",
      };
    },
  },
  {
    name: "buffer_schedule",
    step: "Looking at your Buffer schedule",
    feature: "calendar",
    description: "What's scheduled in Buffer (the next 4 weeks), by account and day, optionally for one job's accounts.",
    input: z.object({ job_id: z.string().optional() }),
    run: async (ctx, { job_id }: { job_id?: string }) => {
      const cal = await bufferCalendar(ctx.user.id);
      const only = job_id ? ((await jobChannels(ctx.user.id))[job_id] ?? []) : null;
      const byAccount = cal.channels
        .filter((c) => !only || only.includes(c.id))
        .map((c) => {
          const posts = cal.scheduled.filter((p) => p.channelId === c.id && p.at);
          const perDay: Record<string, number> = {};
          for (const p of posts) perDay[(p.at as string).slice(0, 10)] = (perDay[(p.at as string).slice(0, 10)] ?? 0) + 1;
          return {
            account: `${c.displayName || c.name} (${c.service})`,
            queuePaused: c.isQueuePaused || undefined,
            scheduled: posts.length,
            lastScheduled:
              posts
                .map((p) => p.at as string)
                .sort()
                .at(-1)
                ?.slice(0, 10) ?? null,
            perDay,
          };
        });
      return { checked: cal.at, accounts: byAccount, failed: cal.failed.length, link: "/hub/studio/calendar" };
    },
  },
  {
    name: "list_shoot_sheets",
    step: "Looking at the shoot sheets",
    feature: "studio",
    description: "A job's shoot sheets, newest first, with links.",
    input: z.object({ job_id: z.string() }),
    run: async (ctx, { job_id }: { job_id: string }) => (await listSheets(ctx.user.id, job_id)).map((s) => ({ ...s, link: `/hub/studio/sheets/${s.id}` })),
  },
  {
    name: "list_edits",
    step: "Looking at your edits",
    feature: "edits",
    description: "Edit cards (videos being edited on your Mac): what's waiting, editing, needs you, ready to check or done.",
    input: z.object({ job_id: z.string().optional() }),
    run: async (ctx, { job_id }: { job_id?: string }) => {
      let q = adminClient()
        .from("hub_edits")
        .select("id, project_id, title, video_code, status, updated_at")
        .eq("user_id", ctx.user.id)
        .order("updated_at", { ascending: false })
        .limit(80);
      if (job_id) q = q.eq("project_id", job_id);
      const { data } = await q;
      return {
        edits: (data ?? []).map((e) => ({
          job_id: e.project_id,
          video: e.video_code,
          title: e.title,
          status: e.status,
          updated: String(e.updated_at).slice(0, 10),
        })),
        link: "/hub/studio/edits",
      };
    },
  },
  {
    name: "list_scripts",
    step: "Looking at your scripts",
    feature: "scripts",
    description: "Scripts written for a job (or the standalone ones if no job is given), latest first.",
    input: z.object({ job_id: z.string().optional() }),
    run: async (ctx, { job_id }: { job_id?: string }) =>
      (await listScripts(ctx.user.id, job_id || "scripts")).map((s) => ({
        title: s.title,
        updated: s.updatedAt.slice(0, 10),
        versions: s.versions.length,
        link: job_id ? `/hub/projects/${job_id}#scripts` : "/hub/scripts",
      })),
  },
  {
    name: "show_buttons",
    step: "",
    description:
      "Buttons under your reply that take them to pages in Creator Desk (or start something there, like a shoot sheet with the number of videos filled in). Use whenever there's somewhere to go next. Only /hub/... links.",
    input: z.object({
      buttons: z
        .array(z.object({ label: text(60).min(1), href: z.string().max(300) }))
        .min(1)
        .max(6),
    }),
    run: async (ctx, { buttons }: { buttons: DwightLink[] }) => {
      const ok = buttons.filter((b) => isHubLink(b.href));
      for (const b of ok) if (!ctx.links.some((l) => l.href === b.href)) ctx.links.push(b);
      return { shown: ok.length, refused: buttons.filter((b) => !isHubLink(b.href)).map((b) => b.href) };
    },
  },
];

/** The tools this person can use (some need a feature switched on), as Claude's tool list. */
export async function toolsFor(user: HubUser) {
  const allowed: Tool[] = [];
  for (const t of TOOLS) if (!t.feature || (await canUse(user, t.feature))) allowed.push(t);
  return allowed;
}

export const toolSpec = (t: Tool) => ({
  name: t.name,
  description: t.description,
  input_schema: z.toJSONSchema(t.input, { io: "input" }) as { type: "object"; [k: string]: unknown },
});

/** Run one tool call; a problem comes back to Claude as the tool's answer, so it can try another way. */
export async function runTool(tools: Tool[], ctx: ToolContext, name: string, raw: unknown): Promise<{ ok: boolean; result: unknown }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, result: `There's no tool called ${name}.` };
  const parsed = tool.input.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, result: `That input didn't fit: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  try {
    return { ok: true, result: await tool.run(ctx, parsed.data as never) };
  } catch (e) {
    console.error("Creator Desk Dwight tool:", name, e);
    return { ok: false, result: e instanceof Error ? e.message : "That didn't work." };
  }
}

export const stepFor = (tools: Tool[], name: string) => tools.find((t) => t.name === name)?.step ?? "";
export { localDay };
