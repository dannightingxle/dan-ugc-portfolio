/* How many videos each tech job still needs to be covered up to a date:
   its videos a day for every day left, less what's already scheduled on its
   Buffer accounts. One video goes to all of a job's accounts, so the account
   with the least scheduled decides. Safe to import anywhere (no I/O). */

type Job = { id: string; brand: string; title?: string; techStage?: string; videosPerDay?: number | null };
type Post = { channelId: string; at: string | null };
type Channel = { id: string; name: string; displayName: string | null; service: string };

export type JobNeed = {
  jobId: string;
  brand: string;
  techStage: string;
  videosPerDay: number | null;
  days: number;
  /** Videos the job needs over those days. */
  needed: number | null;
  accounts: { account: string; scheduled: number; lastScheduled: string | null }[];
  /** Still to make: needed less what's scheduled on its least-covered account. */
  toMake: number | null;
  /** Finished edits on the Mac that may not be scheduled yet. */
  finishedEdits: number;
  problem: string;
};

const DAY = 86_400_000;
const LIVE = ["Active", "Warm-up"];

/** Days from today to `until`, counting both. */
export function daysBetween(today: string, until: string) {
  return Math.max(0, Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) + 1);
}

export function contentNeeded(input: {
  jobs: Job[];
  today: string;
  until: string;
  channels: Channel[] | null;
  scheduled: Post[];
  jobChannels: Record<string, string[]>;
  finishedEdits: Record<string, number>;
}): JobNeed[] {
  const { today, until } = input;
  const days = daysBetween(today, until);
  const end = Date.parse(`${until}T23:59:59Z`);
  return input.jobs
    .filter((j) => j.techStage && LIVE.includes(j.techStage))
    .map((j) => {
      const ids = input.jobChannels[j.id] ?? [];
      const accounts = ids.map((id) => {
        const ch = input.channels?.find((c) => c.id === id);
        const posts = input.scheduled.filter((p) => p.channelId === id && p.at && Date.parse(p.at) <= end);
        const last =
          posts
            .map((p) => p.at as string)
            .sort()
            .at(-1) ?? null;
        return {
          account: ch ? `${ch.displayName || ch.name} (${ch.service})` : `an account Buffer no longer has (${id})`,
          scheduled: posts.length,
          lastScheduled: last ? last.slice(0, 10) : null,
        };
      });
      const perDay = j.videosPerDay && j.videosPerDay > 0 ? j.videosPerDay : null;
      const needed = perDay ? Math.ceil(perDay * days) : null;
      const covered = accounts.length ? Math.min(...accounts.map((a) => a.scheduled)) : 0;
      const problem = !perDay
        ? "Videos a day isn't set on this job, so it can't be worked out. Ask how many a day it needs (and offer to save it on the job)."
        : !input.channels
          ? "Buffer isn't connected, so what's already scheduled isn't counted."
          : !ids.length
            ? "No Buffer accounts are picked for this job (Account tab in its Studio), so nothing scheduled is counted."
            : "";
      return {
        jobId: j.id,
        brand: j.brand || j.title || "Untitled job",
        techStage: j.techStage ?? "",
        videosPerDay: perDay,
        days,
        needed,
        accounts,
        toMake: needed == null ? null : Math.max(0, needed - covered),
        finishedEdits: input.finishedEdits[j.id] ?? 0,
        problem,
      };
    });
}
