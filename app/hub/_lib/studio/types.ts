import { z } from "zod";

/* Studio: one Claude workspace per job, replacing a Claude Project per job.
   The workspace holds the same things the project did - instructions plus
   the brief, app-notes, references, winners and script-bank files - and every
   request to Claude is sent with them. */

export const FILES = [
  { key: "brief", label: "Brief", hint: "The client's brief, cleaned up, nothing left out. Replace it when a new brief lands - never add a second." },
  { key: "appNotes", label: "App notes", hint: "What the app does, key features and where each one is, onboarding steps, pricing." },
  { key: "references", label: "References", hint: "Reference videos described in words: link, hook, format, length, why it works." },
  { key: "winners", label: "Winners", hint: "Your top 5-10 videos: hook, transcript, format, views or retention, one line on why it worked. Rewritten by the Friday review." },
  { key: "scriptBank", label: "Script bank", hint: "Every hook and angle already made, newest first. New shoot sheets add to it and never reuse it." },
] as const;
export type FileKey = (typeof FILES)[number]["key"];

export const ACCOUNT_CHECKS = [
  { id: "created", text: "Fresh account made: natural username with your name (never \"official\", \"app\" or the brand name)" },
  { id: "profile", text: "Casual selfie in natural light, personal bio, no income claims, no brand link until the client says" },
  { id: "verified", text: "Verified by phone, public, TikTok and Instagram linked" },
  { id: "warm1", text: "Warm-up day 1: ~40 min in 3-4 sessions, niche feed watched to the end, 5-10 follows, 5-10 real comments, 3-5 saves" },
  { id: "warm2", text: "Warm-up day 2 (same routine; never interact with other creators on the campaign)" },
  { id: "warm3", text: "Warm-up day 3 (same routine)" },
  { id: "feedtest", text: "Feed test: open the feed cold, count the first 10 videos. 7+ in niche = ready, 4-6 = one more day, under 4 = tell the client" },
  { id: "firstvideo", text: "First-video test at 24h: 1,000+ views healthy, 400-1,000 OK, lower = likely an account problem" },
] as const;

export type Workspace = {
  instructions: string;
  files: Record<FileKey, string>;
  clientQuestions: string[];
  needsDan: string[];
  couldntOpen: string[];
  account: { handles: string; checks: Record<string, boolean>; notes: string };
  lastReview: { at: string; moreOf: string[]; lessOf: string[]; nextWeek: string } | null;
  updatedAt: string | null;
};

export function emptyWorkspace(): Workspace {
  return {
    instructions: "",
    files: { brief: "", appNotes: "", references: "", winners: "", scriptBank: "" },
    clientQuestions: [],
    needsDan: [],
    couldntOpen: [],
    account: { handles: "", checks: {}, notes: "" },
    lastReview: null,
    updatedAt: null,
  };
}

/** Fill in anything missing from a stored workspace. */
export function readWorkspace(raw: unknown): Workspace {
  const w = (raw && typeof raw === "object" ? raw : {}) as Partial<Workspace>;
  const base = emptyWorkspace();
  return {
    ...base,
    ...w,
    files: { ...base.files, ...w.files },
    account: { ...base.account, ...w.account, checks: { ...w.account?.checks } },
  };
}

/* ---- What Claude hands back. Structured outputs keep every response to
   these shapes. (No optional fields: empty strings and lists mean "none".) ---- */

export const IntakeResult = z.object({
  instructions: z.string().describe("The project instructions template, fully filled in from the material. Markdown. No [brackets] left: use a sensible default and list it in needsDan."),
  brief: z.string().describe("The full brief, cleaned up, nothing left out. Merge onboarding pages, subpages and kickoff messages; list contradictions and which version wins."),
  appNotes: z.string().describe("What the app does, key features, where each feature is in the app, onboarding steps, pricing, store availability."),
  references: z.string().describe("Reference videos described in words: link, hook, format, length, why it works. Empty string if none were given."),
  needsDan: z.array(z.string()).describe("Each default you had to assume that only Dan can confirm, written as 'what you assumed - what to check'."),
  clientQuestions: z.array(z.string()).describe("Questions to send the client about anything unclear or missing, ready to paste."),
  couldntOpen: z.array(z.string()).describe("Links you couldn't open, with why."),
});
export type IntakeResult = z.infer<typeof IntakeResult>;

const Clip = z.object({ code: z.string().describe("TH, A1.., B1.., C1.."), video: z.string().describe("V-number"), text: z.string() });

export const SheetVideo = z.object({
  code: z.string().describe("V1, V2… in posting order"),
  day: z.number().int(),
  format: z.number().int().describe("Format number from the brief (1 if the brief has no numbered formats)"),
  type: z.enum(["th", "ls", "ac", "gs"]).describe("th talking head | ls lip-sync | ac acting, no talking | gs green screen"),
  title: z.string().describe("Starts with 'Riff: ' for a variation on a winner or 'Test: ' for a new format"),
  length: z.string(),
  session: z.string().describe("Key of the filming location"),
  ref: z.string().describe("Reference video URL from references/winners/brief; otherwise a TikTok search URL for the format"),
  sound: z.object({ label: z.string(), url: z.string(), sub: z.string() }),
  headline: z.string(),
  headSub: z.string().describe("Style and how long it stays on"),
  captions: z.string().describe("e.g. 'Yes, whole video' or 'No'"),
  script: z.array(z.string()).describe("Talking videos: teleprompter paragraphs. Empty for non-talking"),
  hooks: z.array(z.string()).describe("Talking videos: exactly 2 alternative first lines. Empty for non-talking"),
  delivery: z.string().describe("Optional delivery note, or empty"),
  scriptNote: z.string().describe("True-for-me swaps for any personal claim, or empty"),
  beats: z.array(z.string()).describe("Non-talking videos: what to do, in order. Empty for talking"),
  alts: z.array(z.string()).describe("Non-talking videos: exactly 2 alternative headlines. Empty for talking"),
  where: z.string(),
  props: z.string(),
  over: z.array(z.object({ code: z.string(), text: z.string() })).describe("What goes over the top, by clip code"),
  overNote: z.string().describe("When nothing goes over the top, say what instead; else empty"),
  captionsOpts: z.array(z.object({ label: z.string(), caption: z.string() })).describe("At least one post caption naming the app"),
  hashtags: z.string().describe("Max 5"),
  edit: z.array(z.string()).describe("Edit notes in shot order using the clip codes, overlays, captions"),
});

export const SheetData = z.object({
  kicker: z.string().describe("'App · @handle'"),
  h1: z.string().describe("e.g. 'Week 3 shoot sheet'"),
  summary: z.string().describe("e.g. '7 videos, one a day. Film in 2 places, then edit from each video's card.'"),
  prep: z.array(z.object({ id: z.string(), text: z.string(), linkLabel: z.string(), linkUrl: z.string() })),
  sessions: z.array(
    z.object({
      key: z.string().describe("A, B, C…"),
      name: z.string(),
      light: z.string(),
      videos: z.array(z.string()),
      setup: z.string(),
      props: z.array(z.string()),
      note: z.string(),
      clips: z.array(Clip).describe("Every clip to film here, in filming order"),
    }),
  ),
  videos: z.array(SheetVideo),
});
export type SheetData = z.infer<typeof SheetData>;

export const SheetResult = z.object({
  sheet: SheetData,
  scriptBankEntry: z.string().describe("This batch's hooks and angles, one line per video, for the script-bank file"),
  oneLine: z.string().describe("One line on what's in this sheet"),
});
export type SheetResult = z.infer<typeof SheetResult>;

export const ReviewResult = z.object({
  moreOf: z.array(z.string()),
  lessOf: z.array(z.string()),
  nextWeek: z.string().describe("Next week's plan: the 70/30 mix of winner riffs and new tests, and which formats"),
  winners: z.string().describe("The full rewritten winners file with this week's results added: top 5-10, hook, transcript, format, numbers, one line on why"),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export type SheetSummary = { id: string; title: string; createdAt: string; videos: number };
