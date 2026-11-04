"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChannelGroup } from "../../_lib/buffer/types";
import { Spinner } from "../../_lib/ui";
import { Section } from "../../projects/fields";
import { AccountPicker, call } from "./shared";

/* Which of your Buffer accounts this job's videos go to. "Schedule finished
   videos" on the Calendar posts each video to these; ticking one saves it. */

type Data = {
  connected: boolean;
  channels: { id: string; name: string; displayName: string | null; service: string; avatar: string }[];
  channelIds: string[];
  from: "saved" | "handles";
};

export function JobBufferAccounts({ projectId, brand }: { projectId: string; brand: string }) {
  const api = `/api/hub/buffer/finished?projectId=${encodeURIComponent(projectId)}`;
  const [data, setData] = useState<Data | null>(null);
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, cal] = await Promise.all([call<Data>(api), call<{ groups?: ChannelGroup[] }>("/api/hub/buffer").catch(() => ({ groups: [] }))]);
      setData(d);
      setGroups(cal.groups ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function change(channelIds: string[]) {
    if (!data) return;
    const before = data;
    setData({ ...data, channelIds, from: "saved" });
    setSaved(false);
    setError("");
    try {
      await call("/api/hub/buffer/finished", { method: "PUT", body: JSON.stringify({ projectId, channelIds }) });
      setSaved(true);
    } catch (e) {
      setData(before);
      setError((e as Error).message);
    }
  }

  return (
    <Section title="Where its videos post" action={saved ? <span className="text-xs text-good">Saved</span> : undefined}>
      {!data && !error && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Spinner /> Loading your Buffer accounts…
        </p>
      )}
      {data && !data.connected && (
        <p className="text-sm text-text-muted">
          Connect Buffer on the{" "}
          <Link href="/hub/studio/calendar" className="text-accent hover:underline">
            Calendar
          </Link>{" "}
          to choose which accounts {brand}&apos;s videos post to.
        </p>
      )}
      {data?.connected && (
        <>
          <p className="text-sm text-text-muted">
            Tick every Buffer account {brand}&apos;s videos go to - TikTok, Instagram, YouTube, Facebook. &quot;Schedule finished videos&quot; on the Calendar posts each video to all of them.
            {data.from === "handles" && data.channelIds.length > 0 && " These are suggested from the handles above until you change them."}
          </p>
          <AccountPicker label={`${brand} Buffer accounts`} channels={data.channels} value={data.channelIds} onChange={(ids) => void change(ids)} groups={groups} />
        </>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}
    </Section>
  );
}
