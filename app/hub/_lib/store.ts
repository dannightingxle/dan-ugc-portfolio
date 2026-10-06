"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Ad } from "./types";

/* Demo persistence: starred ads and projects live in this browser's
   localStorage. The real multi-user version swaps this file for a database;
   nothing else in the UI changes. */

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

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {}
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  try {
    if (raw) value = JSON.parse(raw);
  } catch {}
  cache.set(key, { raw, value });
  return value;
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
}

const EMPTY_STARS: Record<string, StarredAd> = {};
const EMPTY_PROJECTS: Project[] = [];

let upgraded: { from: Project[]; to: Project[] } | null = null;
function readProjects(): Project[] {
  const raw = read("hub:projects", EMPTY_PROJECTS);
  if (upgraded?.from !== raw) upgraded = { from: raw, to: raw.map(upgrade) };
  return upgraded.to;
}

export function useStars() {
  const stars = useSyncExternalStore(
    subscribe,
    () => read("hub:stars", EMPTY_STARS),
    () => EMPTY_STARS,
  );
  const toggle = useCallback((ad: Ad) => {
    const next = { ...read("hub:stars", EMPTY_STARS) };
    if (next[ad.id]) delete next[ad.id];
    else next[ad.id] = { ...ad, starredAt: new Date().toISOString() };
    write("hub:stars", next);
  }, []);
  /** Refresh the stored copy with fresh numbers, keeping star date and note. */
  const refresh = useCallback((ad: Ad) => {
    const cur = read("hub:stars", EMPTY_STARS);
    if (!cur[ad.id]) return;
    write("hub:stars", { ...cur, [ad.id]: { ...cur[ad.id], ...ad } });
  }, []);
  return { stars, toggle, refresh };
}

export function useProjects() {
  const projects = useSyncExternalStore(subscribe, readProjects, () => EMPTY_PROJECTS);
  const save = useCallback((p: Project) => {
    const cur = readProjects();
    const i = cur.findIndex((x) => x.id === p.id);
    write("hub:projects", i === -1 ? [p, ...cur] : cur.map((x) => (x.id === p.id ? p : x)));
  }, []);
  const remove = useCallback((id: string) => {
    write(
      "hub:projects",
      readProjects().filter((x) => x.id !== id),
    );
  }, []);
  return { projects, save, remove };
}
