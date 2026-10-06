"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Ad } from "./types";

/* Demo persistence: starred ads and projects live in this browser's
   localStorage. The real multi-user version swaps this file for a database;
   nothing else in the UI changes. */

export type StarredAd = Ad & { starredAt: string; note?: string };

export const STAGES = ["Pitched", "Briefed", "Scripting", "Filming", "Delivered", "Paid"] as const;
export type Stage = (typeof STAGES)[number];

export type Project = {
  id: string;
  brand: string;
  title: string;
  stage: Stage;
  fee: number | null;
  due: string;
  hook: string;
  body: string;
  cta: string;
  notes: string;
  adIds: string[];
  createdAt: string;
};

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
  const projects = useSyncExternalStore(
    subscribe,
    () => read("hub:projects", EMPTY_PROJECTS),
    () => EMPTY_PROJECTS,
  );
  const save = useCallback((p: Project) => {
    const cur = read("hub:projects", EMPTY_PROJECTS);
    const i = cur.findIndex((x) => x.id === p.id);
    write("hub:projects", i === -1 ? [p, ...cur] : cur.map((x) => (x.id === p.id ? p : x)));
  }, []);
  const remove = useCallback((id: string) => {
    write(
      "hub:projects",
      read("hub:projects", EMPTY_PROJECTS).filter((x) => x.id !== id),
    );
  }, []);
  return { projects, save, remove };
}

export function newProject(partial: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    brand: "",
    title: "",
    stage: "Pitched",
    fee: null,
    due: "",
    hook: "",
    body: "",
    cta: "",
    notes: "",
    adIds: [],
    createdAt: new Date().toISOString(),
    ...partial,
  };
}
