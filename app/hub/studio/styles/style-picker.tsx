"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIND_LABEL, type StyleKind } from "../../_lib/edits/style-types";
import { input } from "../../projects/fields";
import { call } from "../../projects/[id]/studio/studio";

/* "Style: Brand deals · change" at the top of a job's Edits tab: which edit
   style this job's edits follow. Unpicked, it's the usual one for the kind of
   job (personal brand, tech UGC or brand deal). */

type Short = { id: string; name: string; kind: StyleKind };
type Data = { style: Short | null; auto: boolean; usual: StyleKind; styles: Short[] };
const USUAL: Record<StyleKind, string> = { personal: "your personal brand", tech: "tech UGC jobs", brand: "brand deals", other: "this job" };

export function StylePicker({ scope }: { scope: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  const api = "/api/hub/edits/styles/use";

  useEffect(() => {
    call<Data>(`${api}?scope=${encodeURIComponent(scope)}`, "GET").then(setData, (e: Error) => setError(e.message));
  }, [scope]);

  async function pick(styleId: string) {
    setError("");
    try {
      setData(await call<Data>(api, "PATCH", { scope, styleId }));
      setChanging(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!data) return error ? <p className="px-1 text-xs text-accent">{error}</p> : null;
  const usual = USUAL[data.usual];
  const link = (
    <Link href="/hub/studio/styles" className="text-accent hover:underline">
      {data.styles.length ? "Your edit styles →" : "Set up your edit styles →"}
    </Link>
  );
  if (!data.styles.length) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-text-muted">
        <span>No edit style yet - save how you edit each kind of video so every device and every edit follows it.</span>
        {link}
      </p>
    );
  }
  return (
    <div className="space-y-2 px-1 text-xs text-text-muted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Style: <strong className="text-text">{data.style?.name ?? "none"}</strong>
          {data.auto && (data.style ? <span className="text-text-dim"> (the usual for {usual})</span> : <span className="text-text-dim"> - no style for {usual} yet</span>)}
        </span>
        <span aria-hidden>·</span>
        <button type="button" onClick={() => setChanging(!changing)} className="font-medium text-accent hover:underline">
          {changing ? "cancel" : "change"}
        </button>
        <span aria-hidden>·</span>
        {link}
      </p>
      {changing && (
        <select className={`${input} w-auto max-w-full`} value={data.auto ? "" : (data.style?.id ?? "")} onChange={(e) => void pick(e.target.value)} aria-label="Edit style for this job">
          <option value="">The usual for {usual}</option>
          {data.styles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({KIND_LABEL[s.kind]})
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-accent">{error}</p>}
    </div>
  );
}
