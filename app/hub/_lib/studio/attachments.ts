import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "../supabase/admin";
import type { Upload } from "./jobs";

/* Videos you attach to a job's material (a brief sent as a video, a screen
   recording): uploaded straight from the browser to a private bucket (too big
   to send through the server), then looked at - frames and what's said - by a
   link that only works for a couple of hours. */

const BUCKET = "studio-uploads";

/** A one-off link to upload one video, and where it'll be. */
export async function attachmentUploadUrl(userId: string, fileName: string) {
  const storage = adminClient().storage;
  const { data: bucket } = await storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  } else if (bucket.file_size_limit || bucket.allowed_mime_types?.length) {
    // Only the project's own upload limit counts.
    await storage.updateBucket(BUCKET, { public: false, fileSizeLimit: null, allowedMimeTypes: null });
  }
  const ext = (/\.(mp4|mov|m4v|webm)$/i.exec(fileName)?.[1] ?? "mp4").toLowerCase();
  const path = `${userId}/${randomUUID()}.${ext}`;
  const { data, error } = await storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("no upload link");
  return { path, token: data.token, bucket: BUCKET };
}

/** The videos among what was attached, each with a link to look at it by (yours only). */
export async function attachedVideos(userId: string, uploads: Upload[]) {
  const mine = uploads.filter((u) => u.path && u.path.startsWith(`${userId}/`) && u.type.startsWith("video/"));
  const out: { label: string; url: string }[] = [];
  for (const u of mine) {
    const { data } = await adminClient().storage.from(BUCKET).createSignedUrl(u.path!, 2 * 3600);
    if (data?.signedUrl) out.push({ label: `a video Dan attached (a brief or a reference - work out which from what's in it): ${u.name}`, url: data.signedUrl });
  }
  return out;
}
