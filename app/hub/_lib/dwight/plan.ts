/* How many videos each tech job still needs to be covered up to a date:
   its videos a day for every day left, less what's already scheduled on its
   Buffer accounts. One video goes to all of a job's accounts, so the account
   with the least scheduled decides. The pace is the job's own "videos a day";
   what Buffer has actually been posting is worked out beside it, used when the
   job has none, and any disagreement is said. Safe to import anywhere (no I/O). */

type Job = { id: string; brand: string; title?: string; techStage?: string; videosPerDay?: number | null };
type Post = { channelId: string; at: string | null };
type Channel = { id: string; name: string; displayName: string | null; service: string };

export type JobNeed = {
  jobId: string;
  brand: string;
  techStage: string;
  /** The pace used: the job's own, else what Buffer has been posting. */
  videosPerDay: number | null;
  paceFrom: "job" | "buffer" | null;
  /** What Buffer shows: posts a day on the days it posts (recent sends and what's queued), busiest account. */
  bufferPerDay: number | null;
  /** The job's pace and Buffer's disagree. */
  paceNote: string;
  days: number;
  /** Videos the job needs over those days. */
  needed: number | null;
  accounts: { account: string; scheduled: number; lastScheduled: string | null; postsPerDay: number | null }[];
  /** Still to make: needed less what's scheduled on its least-covered account. */
  toMake: number | null;
  /** Finished edits on the Mac that may not be scheduled yet. */
  finishedEdits: number;
  problem: string;
};

const DAY = 86_400_000;
const RECENT_DAYS = 14;
const AHEAD_DAYS = 7;

/** Posts a day on the days an account posts (gaps don't count against it): a queue of 2 slots a day reads 2 even if a week was missed. */
export function postsPerDay(posts: Post[]): number | null {
  const byDay = new Map<string, number>();
  for (const p of posts) if (p.at) byDay.set(p.at.slice(0, 10), (byDay.get(p.at.slice(0, 10)) ?? 0) + 1);
  if (!byDay.size) return null;
  const total = [...byDay.values()].reduce((a, b) => a + b, 0);
  return Math.round((total / byDay.size) * 2) / 2;
}
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
  /** Posts Buffer has sent (the last couple of weeks). */
  sent?: Post[];
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
        // How often it posts: recent sends, and the next week of its queue.
        const sinceRecent = Date.parse(`${today}T00:00:00Z`) - RECENT_DAYS * DAY;
        const recent = (input.sent ?? []).filter(
          (p) => p.channelId === id && p.at && Date.parse(p.at) >= sinceRecent && Date.parse(p.at) < Date.parse(`${today}T00:00:00Z`),
        );
        const ahead = input.scheduled.filter((p) => p.channelId === id && p.at && Date.parse(p.at) < Date.parse(`${today}T00:00:00Z`) + AHEAD_DAYS * DAY);
        const rates = [postsPerDay(recent), postsPerDay(ahead)].filter((r): r is number => r != null);
        return {
          account: ch ? `${ch.displayName || ch.name} (${ch.service})` : `an account Buffer no longer has (${id})`,
          scheduled: posts.length,
          lastScheduled: last ? last.slice(0, 10) : null,
          postsPerDay: rates.length ? Math.max(...rates) : null,
        };
      });
      const own = j.videosPerDay && j.videosPerDay > 0 ? j.videosPerDay : null;
      const seen = accounts.map((a) => a.postsPerDay).filter((r): r is number => r != null);
      const bufferPerDay = seen.length ? Math.max(...seen) : null;
      const perDay = own ?? bufferPerDay;
      const paceFrom = own ? "job" : bufferPerDay ? "buffer" : null;
      const paceNote =
        own && bufferPerDay && Math.abs(own - bufferPerDay) >= 0.5
          ? `The job says ${own} a day but Buffer has been posting about ${bufferPerDay} a day on its busiest account. Worked out at ${own} a day; ask which is right.`
          : !own && bufferPerDay
            ? `Videos a day isn't set on this job, so this uses what Buffer has been posting (about ${bufferPerDay} a day). Offer to save it on the job.`
            : "";
      const needed = perDay ? Math.ceil(perDay * days) : null;
      const covered = accounts.length ? Math.min(...accounts.map((a) => a.scheduled)) : 0;
      const problem = !perDay
        ? "Videos a day isn't set on this job and Buffer shows no posts for it, so it can't be worked out. Ask how many a day it needs (and offer to save it on the job)."
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
        paceFrom,
        bufferPerDay,
        paceNote,
        days,
        needed,
        accounts,
        toMake: needed == null ? null : Math.max(0, needed - covered),
        finishedEdits: input.finishedEdits[j.id] ?? 0,
        problem,
      };
    });
}
