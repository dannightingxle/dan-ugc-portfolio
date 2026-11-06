import { z } from "zod";

/* Scripts: a creator drops in a brand brief and gets back a script pack -
   3 hooks, the script by section with visuals and timings, a shot list by
   location and an edit map (docs/scripting-build-brief.md). Everything here
   is per user. Safe to import anywhere. */

export const LENGTHS = [15, 30, 60] as const;
export type Length = (typeof LENGTHS)[number];
export const FORMATS = ["Talking head", "Voiceover + B-roll", "A mix"] as const;
export const DESTINATIONS = ["The brand's ads", "My page", "An application"] as const;
export const SECTION_LABELS = ["HOOK", "PROBLEM", "PRODUCT", "PROOF", "CTA"] as const;
export const SPELLINGS = ["UK", "US"] as const;

/** Spoken words for each length, from the prompt's "Length" section. */
export const WORDS: Record<Length, [number, number]> = {
  15: [35, 40],
  30: [70, 80],
  60: [140, 150],
};
/** The checks allow 15% either side of that. */
export const wordRange = (length: Length): [number, number] => [Math.round(WORDS[length][0] * 0.85), Math.round(WORDS[length][1] * 1.15)];

/** Where a job's own scripts are kept apart from the standalone ones (/hub/scripts). */
export const OWN_SCRIPTS = "scripts";

/** The pack, exactly the shape in the build brief. */
export const ScriptPack = z.object({
  questions: z.array(z.string()).describe("Questions to ask before a script can be written (up to 3). Empty when there's a script"),
  hooks: z.array(z.object({ text: z.string(), visual: z.string() })).describe("Exactly 3 hooks for the same body. Empty when asking questions"),
  sections: z
    .array(
      z.object({
        label: z.enum(SECTION_LABELS),
        start_s: z.number(),
        end_s: z.number(),
        visual: z.string(),
        lines: z.array(z.string()).describe("The spoken lines, 1 per breath"),
      }),
    )
    .describe("The script, in order. Empty when asking questions"),
  shot_list: z.array(
    z.object({
      code: z.string().describe("A, B, C…"),
      location: z.string(),
      shots: z.array(
        z.object({
          code: z.string().describe("A1, A2, B1…"),
          description: z.string(),
        }),
      ),
    }),
  ),
  edit_map: z.array(
    z.object({
      line: z.string(),
      shot: z.string().describe("A shot code from the shot list"),
      on_screen_text: z.string().describe("The text on screen, or empty for none"),
    }),
  ),
  alt_angles: z.array(z.string()),
  placeholders: z.array(z.string()),
  assumptions: z.array(z.string()),
  flags: z.array(z.string()),
  suggested_rule: z.string(),
});
export type ScriptPack = z.infer<typeof ScriptPack>;

export type ScriptRequest = {
  brand: string;
  product: string;
  brief: string;
  length: Length;
  format: string;
  experience: string;
  mustSay: string;
  mustNotSay: string;
  destination: string;
};

export type Answer = { question: string; answer: string };
export type Feedback = { picks: string[]; text: string };
export const FEEDBACK_PICKS = ["Too salesy", "Doesn't sound like me", "Hook's boring", "Too long"] as const;

export type ScriptVersion = {
  id: string;
  createdAt: string;
  /** What made it: the first go, answers to its questions, or feedback on the one before. */
  from: "request" | "answers" | "feedback";
  answers: Answer[];
  feedback: Feedback | null;
  pack: ScriptPack;
  /** Checks it still failed after its one retry (shown as a warning). */
  failed: string[];
  retried: boolean;
};

/** One script: the request and every version of it, newest first. */
export type Script = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  request: ScriptRequest;
  /** The files attached to the request, by name (the files themselves are kept on the server). */
  files: string[];
  versions: ScriptVersion[];
};

export type Rule = { id: string; text: string; createdAt: string };

export type CreatorProfile = {
  name: string;
  handle: string;
  spelling: (typeof SPELLINGS)[number];
  currency: string;
  niches: string;
  facts: string;
  voiceSample: string;
  wordsUsed: string;
  wordsNever: string;
  products: string;
  rules: Rule[];
};

/** A section's lines as one script, and the whole pack as text, for copying. */
export function scriptText(pack: ScriptPack) {
  return pack.sections.map((s) => [`[${s.label} - ${s.start_s}-${s.end_s}s - visual: ${s.visual}]`, ...s.lines].join("\n")).join("\n");
}

export function packText(pack: ScriptPack, title = "") {
  const out: string[] = [];
  if (title) out.push(title, "");
  out.push("HOOKS");
  pack.hooks.forEach((h, i) => out.push(`${i + 1}. ${h.text}`, `   Visual: ${h.visual}`));
  out.push("", "SCRIPT", scriptText(pack), "", "SHOT LIST");
  for (const l of pack.shot_list) out.push(`${l.code} - ${l.location}`, ...l.shots.map((s) => `  ${s.code}: ${s.description}`));
  out.push("", "EDIT MAP");
  for (const r of pack.edit_map) out.push(`${r.shot} | ${r.line} | ${r.on_screen_text || "-"}`);
  const extra: [string, string[]][] = [
    ["OTHER ANGLES", pack.alt_angles],
    ["PLACEHOLDERS", pack.placeholders],
    ["ASSUMPTIONS", pack.assumptions],
    ["FLAGS", pack.flags],
  ];
  for (const [label, items] of extra) if (items.length) out.push("", label, ...items.map((i) => `- ${i}`));
  return out.join("\n");
}
