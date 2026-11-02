"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reloadProject } from "../../_lib/store";
import { useTasks } from "../../_lib/studio/tasks-client";
import { TextBox } from "../../_lib/text-box";
import { Busy } from "../../_lib/ui";
import { Field, Section, input } from "../../projects/fields";
import { FilePicker, type Upload } from "../../projects/[id]/studio/studio";

/* A new tech job from everything you have on it, in one go: it's added to your
   tracker and set up in the background - the job's files, its details, its
   setup to-dos and suggested handles - and you land on its Studio to watch. */

export function NewJob() {
  const router = useRouter();
  const { refresh } = useTasks();
  const [material, setMaterial] = useState("");
  const [filming, setFilming] = useState("solo, phone on a tripod, at home and around town, second phone filming app screens over my shoulder");
  const [voice, setVoice] = useState("casual, direct, a bit dry");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/hub/studio/new-job", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ material, filming, voice, uploads }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`);
      await Promise.all([reloadProject(json.projectId), refresh()]);
      router.push(`/hub/projects/${json.projectId}/studio?tab=setup`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic">New tech job from its brief</h1>
        <p className="mt-2 text-text-muted">
          Dump in everything you have and it does the rest: the job goes in your tracker, and Claude sets up its files the way a Claude Project would, fills in the job&apos;s details,
          turns the setup steps into to-dos and suggests your handles.
        </p>
      </div>
      <Section title="Everything you have on it">
        <form onSubmit={run} className="space-y-4">
          <Field label="Links and messages" hint="Notion pages (with their sub-pages) and Google Docs shared by link are read in full; TikTok and Instagram links are watched. Paste WhatsApps, emails and rates as they are.">
            <TextBox rows={14} className={input} value={material} onValue={setMaterial} placeholder={"https://www.notion.so/…\n\nWhatsApp from the client:\n…"} />
          </Field>
          <FilePicker accept="application/pdf,image/png,image/jpeg,image/webp" label="PDFs or screenshots (optional)" onChange={setUploads} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How you film">
              <input className={input} value={filming} onChange={(e) => setFilming(e.target.value)} />
            </Field>
            <Field label="Your voice (3-4 words)">
              <input className={input} value={voice} onChange={(e) => setVoice(e.target.value)} />
            </Field>
          </div>
          <button disabled={busy || (!material.trim() && !uploads.length)} className="w-full rounded-xl bg-accent py-3 font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-70 sm:w-auto sm:px-6">
            <Busy busy={busy} label="Adding the job…">
              Add the job and set it all up
            </Busy>
          </button>
          <p className="text-xs text-text-dim">Takes a few minutes and runs in the background: you&apos;ll go to the job&apos;s Studio, where you can watch it or carry on with something else.</p>
          {error && <p className="text-sm text-accent">{error}</p>}
        </form>
      </Section>
    </div>
  );
}
