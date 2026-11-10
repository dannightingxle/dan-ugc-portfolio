"use client";

import { SERVICE_LABEL, type Channel, type ChannelGroup } from "../../_lib/buffer/types";
import { SUPABASE_KEY, SUPABASE_URL } from "../../_lib/supabase/config";

/* What the Calendar's scheduling forms share: talking to Creator Desk, uploading a video for Buffer, account avatars. */

export const input = "w-full rounded-xl border border-border bg-bg-card px-3 py-2 text-sm outline-none focus:border-accent";

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
  return json as T;
}

export function Avatar({ channel, size = "h-6 w-6" }: { channel?: Channel; size?: string }) {
  if (!channel) return <span className={`${size} shrink-0 rounded-full bg-text/10`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={channel.avatar} alt="" className={`${size} shrink-0 rounded-full border border-border object-cover`} />;
}

// Your Supabase project, for the one setting a too-big video needs.
const SUPABASE_PROJECT = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(SUPABASE_URL)?.[1];

/** What Supabase said about a failed upload, in its own words (for working out why). */
function said(body: string) {
  try {
    const m = (JSON.parse(body) as { message?: string; error?: string }).message ?? "";
    return m ? ` - Supabase said "${m.slice(0, 160)}"` : "";
  } catch {
    return "";
  }
}

export type Upload = { file: File; progress: number; path?: string; error?: string; promise: Promise<string>; abort: () => void };

/** How long a video file is, in seconds, read by the browser (null if it can't tell). Facebook needs it: over 90 seconds
    can't be a Facebook reel. */
export function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (n: number | null) => {
      URL.revokeObjectURL(url);
      resolve(n);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    v.src = url;
  });
}

/** Upload a video straight to storage (too big to go through the server), with progress. It starts as soon as you pick the video. */
export function uploadVideo(file: File, onProgress: (pct: number) => void): { promise: Promise<string>; abort: () => void } {
  let xhr: XMLHttpRequest | null = null;
  let aborted = false;
  const promise = new Promise<string>(async (resolve, reject) => {
    try {
      const { path, token } = await call<{ path: string; token: string }>("/api/hub/buffer/upload", { method: "POST", body: JSON.stringify({ name: file.name }) });
      if (aborted) return reject(new Error("Upload cancelled."));
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      xhr = new XMLHttpRequest();
      xhr.open("PUT", `${SUPABASE_URL}/storage/v1/object/upload/sign/buffer-media/${path}?token=${encodeURIComponent(token)}`);
      xhr.setRequestHeader("apikey", SUPABASE_KEY);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        if (!xhr) return;
        if (xhr.status >= 200 && xhr.status < 300) resolve(path);
        else if (xhr.status === 413 || /too large|exceeded the maximum|maximum allowed size/i.test(xhr.responseText))
          reject(
            new Error(
              `Your storage turned this video down for being too big (${Math.round(file.size / 1_000_000)} MB${said(xhr.responseText)}). It's one setting in Supabase: Storage → Settings → "Upload file size limit" - set it to 5 GB and save${SUPABASE_PROJECT ? ` (supabase.com/dashboard/project/${SUPABASE_PROJECT}/storage/buckets, then Settings)` : ""}. If you've just changed it, give it a few minutes, then try again. On Supabase's free plan it can't go above 50 MB.`,
            ),
          );
        else reject(new Error(`The upload didn't go through (${xhr.status}${said(xhr.responseText)}). Try again.`));
      };
      xhr.onerror = () => reject(new Error("The upload didn't go through. Check your connection and try again."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));
      xhr.send(body);
    } catch (e) {
      reject(e);
    }
  });
  // Nobody may be waiting on it yet: the error is shown from state.
  promise.catch(() => {});
  return {
    promise,
    abort: () => {
      aborted = true;
      xhr?.abort();
    },
  };
}

type PickerChannel = Pick<Channel, "id" | "name" | "service" | "avatar"> & { displayName?: string | null };

/** Which of your Buffer accounts something goes to: every account as a row you tick, and your channel groups as one-tap picks. */
export function AccountPicker({
  label,
  channels,
  value,
  onChange,
  groups = [],
  disabled = false,
}: {
  label: string;
  channels: PickerChannel[];
  value: string[];
  onChange: (ids: string[]) => void;
  groups?: ChannelGroup[];
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-muted">Use a group:</span>
          {groups.map((g) => {
            const ids = g.channelIds.filter((id) => channels.some((c) => c.id === id));
            const same = ids.length > 0 && ids.length === value.length && ids.every((id) => value.includes(id));
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={same}
                disabled={disabled || !ids.length}
                onClick={() => onChange(ids)}
                className={`rounded-lg border px-3 py-1 font-medium transition disabled:opacity-50 ${same ? "border-accent bg-accent text-on-accent" : "border-border-strong hover:border-accent"}`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {channels.map((c) => {
          const on = value.includes(c.id);
          return (
            <li key={c.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${on ? "border-accent bg-accent-soft" : "border-border bg-bg-card hover:border-border-strong"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  checked={on}
                  disabled={disabled}
                  aria-label={`${c.name} on ${SERVICE_LABEL[c.service] ?? c.service}`}
                  onChange={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
                />
                <Avatar channel={c as Channel} />
                <span className="min-w-0">
                  <span className={`block truncate ${on ? "font-medium" : ""}`}>{c.displayName || c.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {SERVICE_LABEL[c.service] ?? c.service}
                    {c.displayName && c.displayName !== c.name ? ` · ${c.name}` : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
