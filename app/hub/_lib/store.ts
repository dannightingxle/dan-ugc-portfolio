"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ad } from "./types";
import { exampleProject } from "./example-project";

/* Starred ads and projects. Pages read and write through the hooks at the
   bottom; underneath, data lives either in the signed-in user's Supabase rows
   ("remote") or in this browser's localStorage when accounts aren't set up
   ("local"). Writes update the screen instantly and save in the background. */

export type StarredAd = Ad & { starredAt: string; note?: string };

export const STAGES = ["Pitched", "Briefed", "Scripting", "Filming", "Delivered", "Paid"] as const;
export type Stage = (typeof STAGES)[number];

export const PAYMENT_STATUSES = ["Not invoiced", "Invoiced", "Paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPPING = ["Not needed", "Waiting", "On its way", "Received"] as const;

export type Deliverable = { id: string; item: string; qty: number; format: string; length: string; done: boolean };
export type LinkItem = { id: string; label: string; url: string };

export type Project = {
  id: string;
  /** The sample job new accounts start with. */
  example?: boolean;
  createdAt: string;
  brand: string;
  title: string;
  stage: Stage;
  adIds: string[];
  // Dates
  filmBy: string;
  due: string;
  goLive: string;
  // Payment
  fee: number | null;
  paymentStatus: PaymentStatus;
  invoiceNumber: string;
  invoicedOn: string;
  paymentTermsDays: number | null;
  paidOn: string;
  paymentNotes: string;
  // Contact
  contact: { name: string; role: string; company: string; email: string; phone: string; handle: string };
  // Brief
  deliverables: Deliverable[];
  product: string;
  shipping: (typeof SHIPPING)[number];
  usageRights: string;
  exclusivity: string;
  revisions: string;
  keyMessages: string;
  dos: string;
  donts: string;
  links: LinkItem[];
  notes: string;
  // Script draft (full scripting tool is coming later)
  script: string;
};

export function newProject(partial: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    brand: "",
    title: "",
    stage: "Pitched",
    adIds: [],
    filmBy: "",
    due: "",
    goLive: "",
    fee: null,
    paymentStatus: "Not invoiced",
    invoiceNumber: "",
    invoicedOn: "",
    paymentTermsDays: 30,
    paidOn: "",
    paymentNotes: "",
    contact: { name: "", role: "", company: "", email: "", phone: "", handle: "" },
    deliverables: [],
    product: "",
    shipping: "Not needed",
    usageRights: "",
    exclusivity: "",
    revisions: "",
    keyMessages: "",
    dos: "",
    donts: "",
    links: [],
    notes: "",
    script: "",
    ...partial,
  };
}

/** Fill in fields added since a project was saved (and fold the old hook/body/CTA into script). */
function upgrade(raw: Partial<Project> & { hook?: string; body?: string; cta?: string }): Project {
  const { hook, body, cta, ...rest } = raw;
  const p = newProject(rest);
  p.contact = { ...newProject().contact, ...raw.contact };
  if (!raw.script && (hook || body || cta)) p.script = [hook, body, cta].filter(Boolean).join("\n\n");
  return p;
}

/** When an invoice is due, and whether it's late. */
export function paymentDue(p: Project): { date: string; overdue: boolean } | null {
  if (p.paymentStatus !== "Invoiced" || !p.invoicedOn) return null;
  const d = new Date(p.invoicedOn);
  d.setDate(d.getDate() + (p.paymentTermsDays ?? 0));
  const date = d.toISOString().slice(0, 10);
  return { date, overdue: date < new Date().toISOString().slice(0, 10) };
}

/* ---- In-memory state the hooks read ---- */

type SyncStatus = "idle" | "saving" | "error";
type State = { ready: boolean; stars: Record<string, StarredAd>; projects: Project[]; sync: SyncStatus };

let state: State = { ready: false, stars: {}, projects: [], sync: "idle" };
const listeners = new Set<() => void>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/* ---- Backends ---- */

type Backend = {
  saveProject(p: Project): void;
  removeProject(id: string): void;
  saveStar(ad: StarredAd, immediate: boolean): void;
  removeStar(id: string): void;
  /** Send any saves still waiting for a pause in typing, now. */
  flush(): Promise<void>;
};

const LOCAL_STARS = "hub:stars";
const LOCAL_PROJECTS = "hub:projects";

function readLocal() {
  const parse = <T,>(key: string, fallback: T): T => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback;
    } catch {
      return fallback;
    }
  };
  const projects = parse<Partial<Project>[]>(LOCAL_PROJECTS, []);
  return { stars: parse<Record<string, StarredAd>>(LOCAL_STARS, {}), projects: Array.isArray(projects) ? projects.map(upgrade) : [] };
}

const localBackend: Backend = {
  saveProject: () => persistLocal(),
  removeProject: () => persistLocal(),
  saveStar: () => persistLocal(),
  removeStar: () => persistLocal(),
  flush: async () => {},
};

function persistLocal() {
  try {
    localStorage.setItem(LOCAL_STARS, JSON.stringify(state.stars));
    localStorage.setItem(LOCAL_PROJECTS, JSON.stringify(state.projects));
  } catch {}
}

/** Saves to Supabase. Typing produces lots of edits, so project saves wait for a short pause. */
function remoteBackend(db: SupabaseClient): Backend {
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; op: () => PromiseLike<{ error: unknown }> }>();
  let inFlight = 0;

  async function run(op: () => PromiseLike<{ error: unknown }>) {
    inFlight++;
    setState({ sync: "saving" });
    const { error } = await op();
    inFlight--;
    if (error) {
      console.error("Creator Desk: save failed", error);
      setState({ sync: "error" });
    } else if (inFlight === 0 && pending.size === 0) {
      setState({ sync: "idle" });
    }
  }

  function later(key: string, op: () => PromiseLike<{ error: unknown }>) {
    clearTimeout(pending.get(key)?.timer);
    setState({ sync: "saving" });
    const timer = setTimeout(() => {
      pending.delete(key);
      run(op);
    }, 600);
    pending.set(key, { timer, op });
  }

  function cancel(key: string) {
    clearTimeout(pending.get(key)?.timer);
    pending.delete(key);
  }

  async function flush() {
    const ops = [...pending.values()];
    pending.clear();
    ops.forEach((p) => clearTimeout(p.timer));
    await Promise.all(ops.map((p) => run(p.op)));
  }

  // Leaving or hiding the page mid-edit: save straight away rather than lose it.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => void flush());
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flush());
    window.addEventListener("beforeunload", (e) => {
      if (pending.size || inFlight) {
        void flush();
        e.preventDefault();
      }
    });
  }

  return {
    saveProject: (p) => later("p:" + p.id, () => db.from("hub_projects").upsert({ id: p.id, data: p, updated_at: new Date().toISOString() })),
    removeProject: (id) => {
      cancel("p:" + id);
      run(() => db.from("hub_projects").delete().eq("id", id));
    },
    saveStar: (ad, immediate) => {
      const op = () => db.from("hub_starred_ads").upsert({ ad_id: ad.id, data: ad, starred_at: ad.starredAt });
      if (immediate) run(op);
      else later("s:" + ad.id, op);
    },
    removeStar: (id) => {
      cancel("s:" + id);
      run(() => db.from("hub_starred_ads").delete().eq("ad_id", id));
    },
    flush,
  };
}

let backend: Backend | null = null;
let loadedFor: string | null = null;

/** Called once by AccountProvider: pick where data lives and load it. */
export async function initStore(opts: { mode: "local" } | { mode: "remote"; db: SupabaseClient; userId: string }) {
  const key = opts.mode === "local" ? "local" : opts.userId;
  if (loadedFor === key) return;
  loadedFor = key;

  if (opts.mode === "local") {
    backend = localBackend;
    setState({ ready: true, ...readLocal() });
    let added = true;
    try {
      added = Boolean(localStorage.getItem(EXAMPLE_ADDED));
      localStorage.setItem(EXAMPLE_ADDED, "1");
    } catch {}
    if (!added && state.projects.length === 0) addExampleProject();
    return;
  }

  backend = remoteBackend(opts.db);
  setState({ ready: false, stars: {}, projects: [] });
  const [p, s] = await Promise.all([
    opts.db.from("hub_projects").select("data").order("updated_at", { ascending: false }),
    opts.db.from("hub_starred_ads").select("data"),
  ]);
  if (p.error || s.error) {
    console.error("Creator Desk: load failed", p.error ?? s.error);
    setState({ ready: true, sync: "error" });
    return;
  }
  setState({
    ready: true,
    projects: (p.data ?? []).map((r) => upgrade(r.data as Partial<Project>)),
    stars: Object.fromEntries((s.data ?? []).map((r) => [(r.data as StarredAd).id, r.data as StarredAd])),
  });
  // New accounts get the example job once (remembered on the account, so deleting it sticks on every device).
  const { data } = await opts.db.auth.getUser();
  if (data.user && !data.user.user_metadata?.example_added) {
    if (state.projects.length === 0) {
      addExampleProject();
      await backend.flush();
      if (state.sync === "error") return; // not saved - try again next visit
    }
    await opts.db.auth.updateUser({ data: { example_added: true } });
  }
}

const EXAMPLE_ADDED = "hub:example-added";

/** Add the filled-in example job (also used by the "Add an example project" button). */
export function addExampleProject() {
  const p = exampleProject();
  setState({ projects: [p, ...state.projects] });
  backend?.saveProject(p);
  return p;
}

/* ---- Moving browser data into an account ---- */

const IMPORTED = "hub:imported";

/** What's saved in this browser from before accounts, if not already brought over. */
export function localDataToImport() {
  try {
    if (localStorage.getItem(IMPORTED)) return null;
  } catch {
    return null;
  }
  const local = readLocal();
  const stars = Object.values(local.stars);
  return local.projects.length || stars.length ? { projects: local.projects, stars } : null;
}

export async function importLocalData(db: SupabaseClient) {
  const local = localDataToImport();
  if (!local) return;
  const existing = new Set(state.projects.map((p) => p.id));
  const uuid = /^[0-9a-f-]{36}$/i;
  // Early demo projects used short ids; give those a proper one.
  const projects = local.projects.map((p) => (uuid.test(p.id) ? p : { ...p, id: crypto.randomUUID() })).filter((p) => !existing.has(p.id));
  const now = new Date().toISOString();
  const results = await Promise.all([
    projects.length ? db.from("hub_projects").upsert(projects.map((p) => ({ id: p.id, data: p, updated_at: now }))) : { error: null },
    local.stars.length ? db.from("hub_starred_ads").upsert(local.stars.map((a) => ({ ad_id: a.id, data: a, starred_at: a.starredAt }))) : { error: null },
  ]);
  const error = results.find((r) => r.error)?.error;
  if (error) throw error;
  try {
    localStorage.setItem(IMPORTED, now);
  } catch {}
  setState({
    projects: [...projects, ...state.projects],
    stars: { ...Object.fromEntries(local.stars.map((a) => [a.id, a])), ...state.stars },
  });
}

/* ---- Hooks ---- */

export function useDataReady() {
  return useSyncExternalStore(subscribe, () => state.ready, () => false);
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => state.sync, () => "idle" as SyncStatus);
}

const EMPTY_STARS: Record<string, StarredAd> = {};
const EMPTY_PROJECTS: Project[] = [];

export function useStars() {
  const stars = useSyncExternalStore(subscribe, () => state.stars, () => EMPTY_STARS);
  const toggle = useCallback((ad: Ad) => {
    const next = { ...state.stars };
    if (next[ad.id]) {
      delete next[ad.id];
      setState({ stars: next });
      backend?.removeStar(ad.id);
    } else {
      const starred: StarredAd = { ...ad, starredAt: new Date().toISOString() };
      setState({ stars: { ...next, [ad.id]: starred } });
      backend?.saveStar(starred, true);
    }
  }, []);
  /** Refresh the stored copy with fresh numbers, keeping star date and note. */
  const refresh = useCallback((ad: Ad) => {
    const cur = state.stars[ad.id];
    if (!cur) return;
    const updated = { ...cur, ...ad };
    if (JSON.stringify(updated) === JSON.stringify(cur)) return;
    setState({ stars: { ...state.stars, [ad.id]: updated } });
    backend?.saveStar(updated, false);
  }, []);
  return { stars, toggle, refresh };
}

export function useProjects() {
  const projects = useSyncExternalStore(subscribe, () => state.projects, () => EMPTY_PROJECTS);
  const save = useCallback((p: Project) => {
    const i = state.projects.findIndex((x) => x.id === p.id);
    setState({ projects: i === -1 ? [p, ...state.projects] : state.projects.map((x) => (x.id === p.id ? p : x)) });
    backend?.saveProject(p);
  }, []);
  const remove = useCallback((id: string) => {
    setState({ projects: state.projects.filter((x) => x.id !== id) });
    backend?.removeProject(id);
  }, []);
  return { projects, save, remove };
}
