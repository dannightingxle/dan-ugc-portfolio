/* Buffer, as Creator Desk shows it: your channels, what's scheduled, what
   failed and how sent posts did. Safe to import anywhere. */

export type Channel = {
  id: string;
  name: string;
  displayName: string | null;
  service: string;
  avatar: string;
  isQueuePaused: boolean;
  isDisconnected: boolean;
  isLocked: boolean;
  externalLink: string | null;
  /** Buffer's posting goal for the channel this period, if you've set one. */
  goal: { goal: number; scheduledCount: number; sentCount: number } | null;
};

export type CalendarPost = {
  id: string;
  text: string;
  status: string;
  /** When it goes out (scheduled) or went out (sent). */
  at: string | null;
  channelId: string;
  service: string;
  /** The post on the network, once it's out. */
  link: string | null;
  /** Put in the queue's next free slot rather than at a time you picked. */
  queued: boolean;
  error: string | null;
  thumbnail: string | null;
  video: boolean;
  /** Buffer refreshes these about once a day. */
  metrics: { views: number | null; likes: number | null; comments: number | null; shares: number | null } | null;
};

export type CalendarData = { at: string; organization: string; channels: Channel[]; scheduled: CalendarPost[]; failed: CalendarPost[]; sent: CalendarPost[] };

export type ScheduleResult = { channelId: string; ok: true; dueAt: string | null } | { channelId: string; ok: false; error: string };

export const SERVICE_LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", threads: "Threads", facebook: "Facebook", twitter: "X", linkedin: "LinkedIn", pinterest: "Pinterest", bluesky: "Bluesky" };

/** How long a caption can be on each network (TikTok's limit is lower with a video). */
export const CAPTION_LIMIT: Record<string, number> = { tiktok: 2200, instagram: 2200, youtube: 5000, threads: 500, twitter: 280, bluesky: 300 };
