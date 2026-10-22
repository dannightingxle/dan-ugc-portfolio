/* Edit styles: the different ways your videos get edited (personal brand,
   tech UGC, brand deals…), each with a short summary, its rules and a few key
   frames that show what it looks like. Kept in the cloud, so every device and
   every edit uses the same ones. Safe to import anywhere. */

export const STYLE_KINDS = ["personal", "tech", "brand", "other"] as const;
export type StyleKind = (typeof STYLE_KINDS)[number];
export const KIND_LABEL: Record<StyleKind, string> = { personal: "Personal brand", tech: "Tech UGC", brand: "Brand deals", other: "Other" };

/** One style. source: "mac" when it came from reading your Mac's setup, "you" once you've changed it here (a later read of your Mac leaves it alone). */
export type EditStyle = {
  id: string;
  name: string;
  kind: StyleKind;
  summary: string;
  rules: string[];
  source: "mac" | "you";
  /** The Macs it was read from (reads from different Macs add together). */
  macs?: string[];
  updatedAt: string;
};

/** A still from a finished video (or a screenshot) showing the style: text, fonts, captions, B-roll. */
export type StyleFrame = { id: string; data: string; at: number | null; source: string; addedAt: string };

/** Key frames kept per style; the oldest go first. */
export const MAX_FRAMES = 12;
/** Frames one upload (from your Mac or this page) can add. */
export const FRAMES_PER_UPLOAD = 8;
/** A frame's data URL, at most (about 120KB of image). */
export const MAX_FRAME_CHARS = 165_000;
/** Screenshots are shrunk to this width in the browser before they're sent. */
export const FRAME_WIDTH = 720;
export const MAX_RULES = 40;
export const MAX_STYLES = 24;
export const FRAME_DATA = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

/** The oldest helper that can read your Mac's editing setup and grab key frames. */
export const HELPER_FOR_STYLES = "0.3.8";
/** The oldest helper that can carry your editing setup's files between your Macs (see setup-types.ts). */
export const HELPER_FOR_SETUP = "0.3.9";

/** A request to your Mac: read its editing setup ("scan") or grab frames from a video you pick ("grab"). */
export type StyleRequest = {
  id: string;
  kind: "scan" | "grab";
  styleId?: string;
  deviceId: string | null;
  /** waiting: not picked up yet · taken: your Mac has it · sorting: Claude is sorting what it read · expired: no answer in time. */
  status: "waiting" | "taken" | "sorting" | "done" | "failed" | "expired";
  createdAt: string;
  takenAt?: string;
  finishedAt?: string;
  error?: string;
  /** A scan: Claude's note on what it found, the files it read, and the styles it added or updated. */
  reply?: string;
  files?: string[];
  added?: string[];
  updated?: string[];
  kept?: string[];
  /** A frame grab: how many frames arrived. */
  frames?: number;
};

/** Which style a job's edits use when you haven't picked one: personal brand → personal, tech UGC jobs → tech, other jobs (brand deals) → brand. */
export function defaultKind(scope: { personal: boolean; tech: boolean }): StyleKind {
  return scope.personal ? "personal" : scope.tech ? "tech" : "brand";
}

/** The style a scope uses: the one picked for it, or the first of its default kind. */
export function styleFor<S extends Pick<EditStyle, "id" | "kind">>(styles: S[], pickedId: string | undefined | null, scope: { personal: boolean; tech: boolean }): { style: S | null; auto: boolean } {
  const picked = pickedId ? styles.find((s) => s.id === pickedId) : undefined;
  if (picked) return { style: picked, auto: false };
  const kind = defaultKind(scope);
  return { style: styles.find((s) => s.kind === kind) ?? null, auto: true };
}
