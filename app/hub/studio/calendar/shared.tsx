"use client";

import type { Channel } from "../../_lib/buffer/types";
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

export type Upload = { file: File; progress: number; path?: string; error?: string; promise: Promise<string>; abort: () => void };

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
              `Your storage turned this video down for being too big (${Math.round(file.size / 1_000_000)} MB). It's one setting in Supabase: Storage → Settings → "Upload file size limit" - set it to 5 GB and save${SUPABASE_PROJECT ? ` (supabase.com/dashboard/project/${SUPABASE_PROJECT}/storage/buckets, then Settings)` : ""}. Then try again.`,
            ),
          );
        else reject(new Error(`The upload didn't go through (${xhr.status}). Try again.`));
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
