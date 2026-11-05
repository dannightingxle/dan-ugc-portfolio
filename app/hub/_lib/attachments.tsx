"use client";

import { useState, useSyncExternalStore } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase/config";
import { Field } from "../projects/fields";

/* Attaching files to what you give Claude (a job's brief, this week's shoot
   sheet, a job filled in from its brief): PDFs and screenshots are sent along
   (screenshots made smaller first), videos go straight to private storage. */

/** A file attached to the material: sent along (a PDF, a screenshot), or uploaded to storage first (a video). */
export type Upload = { name: string; type: string; data?: string; path?: string };
// Files still uploading anywhere on the page: the job buttons wait for them, so nothing's sent without its attachments.
let uploading = 0;
const uploadWatchers = new Set<() => void>();
function setUploading(change: number) {
  uploading += change;
  uploadWatchers.forEach((w) => w());
}
export function useUploading() {
  return useSyncExternalStore(
    (w) => (uploadWatchers.add(w), () => uploadWatchers.delete(w)),
    () => uploading > 0,
    () => false,
  );
}

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** A screenshot made small enough to send several (long side 1600px, as a JPEG); kept as it is if it's small already. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
async function shrinkImage(f: File): Promise<Upload> {
  if (f.size < 400_000 && IMAGE_TYPES.includes(f.type)) return { name: f.name, type: f.type, data: await base64(f) };
  try {
    const bitmap = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (blob && blob.size < f.size) return { name: f.name.replace(/\.\w+$/, ".jpg"), type: "image/jpeg", data: await base64(blob) };
  } catch {}
  // Claude takes PNG, JPEG, WebP and GIF; a photo in another format (HEIC) the browser couldn't turn into one is named.
  if (!IMAGE_TYPES.includes(f.type)) throw new Error(`${f.name} is a ${f.type.replace("image/", "").toUpperCase() || "picture"} - save it as a PNG or JPEG (or take a screenshot of it) and attach that.`);
  return { name: f.name, type: f.type, data: await base64(f) };
}

/** A video goes straight to storage (too big to send along), with progress; only where it is is sent. */
async function uploadAttachedVideo(f: File, onProgress: (pct: number) => void): Promise<Upload> {
  const r = await fetch("/api/hub/studio/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name }) });
  const link = (await r.json().catch(() => ({}))) as { path?: string; token?: string; bucket?: string; error?: string };
  if (!r.ok || !link.path || !link.token) throw new Error(link.error ?? "Couldn't upload the video - try again.");
  await new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", f);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${SUPABASE_URL}/storage/v1/object/upload/sign/${link.bucket}/${link.path}?token=${encodeURIComponent(link.token!)}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              xhr.status === 413 || /maximum allowed size|too large/i.test(xhr.responseText)
                ? `${f.name} is bigger than your storage allows (${Math.round(f.size / 1_000_000)} MB) - raise "Upload file size limit" in Supabase → Storage → Settings.`
                : `${f.name} didn't upload (${xhr.status}) - try again.`,
            ),
          );
    xhr.onerror = () => reject(new Error(`${f.name} didn't upload - check your connection and try again.`));
    xhr.send(body);
  });
  return { name: f.name, type: f.type || "video/mp4", path: link.path };
}

async function readUploads(files: FileList | null, onProgress: (text: string) => void): Promise<Upload[]> {
  const list = [...(files ?? [])];
  const out: Upload[] = [];
  for (const f of list) {
    if (f.type.startsWith("video/")) out.push(await uploadAttachedVideo(f, (pct) => onProgress(`Uploading ${f.name}… ${pct}%`)));
    else if (f.type.startsWith("image/")) out.push(await shrinkImage(f));
    else out.push({ name: f.name, type: f.type, data: await base64(f) });
  }
  return out;
}

export function FilePicker({ accept, label, onChange }: { accept: string; label: string; onChange: (u: Upload[]) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const videos = accept.includes("video");
  return (
    <Field label={label} hint={status || (names.length ? names.join(", ") : videos ? "Screenshots, PDFs and videos (a brief sent as a video is watched and listened to)." : "Up to 3 MB in total.")}>
      <input
        type="file"
        multiple
        accept={accept}
        aria-label={label}
        className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg-card file:px-3 file:py-1.5 file:text-sm"
        onChange={async (e) => {
          const files = e.target.files;
          setNames([...(files ?? [])].map((f) => f.name));
          setError("");
          setUploading(1);
          try {
            onChange(await readUploads(files, setStatus));
            setStatus("");
          } catch (err) {
            onChange([]);
            setStatus("");
            setError((err as Error).message);
          } finally {
            setUploading(-1);
          }
        }}
      />
      {error && <span className="mt-1 block text-sm text-accent">{error}</span>}
    </Field>
  );
}

