import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { type CreatorProfile, type ScriptRequest, WORDS } from "./types";

/* The system prompt is app/hub/_lib/studio/scriptwriting-prompt.md, word for
   word, with the creator's profile and rules filled in. Only the note to
   developers at its top (an HTML comment) is left out. It's shipped with the
   route that uses it (next.config.ts). */

export const PROMPT_FILE = "app/hub/_lib/studio/scriptwriting-prompt.md";

let template: string | null = null;
function loadTemplate() {
  return (template ??= readFileSync(path.join(process.cwd(), PROMPT_FILE), "utf8").replace(/^<!--[\s\S]*?-->\s*/m, ""));
}

const given = (v: string, none = "Not given.") => v.trim() || none;

export function profileText(p: CreatorProfile) {
  return [
    `Name: ${given(p.name)}${p.handle.trim() ? ` (${p.handle.trim().startsWith("@") ? "" : "@"}${p.handle.trim()})` : ""}`,
    `Spelling: ${p.spelling}. Currency: ${p.currency}.`,
    `Niches: ${given(p.niches)}`,
    `True facts about them (only these can be used as personal details in a script):\n${given(p.facts, "None given. Use [placeholders] for any personal detail.")}`,
    `How they talk (a sample):\n${given(p.voiceSample)}`,
    `Words they use: ${given(p.wordsUsed)}`,
    `Words they'd never say: ${given(p.wordsNever)}`,
    `Products they genuinely use: ${given(p.products)}`,
  ].join("\n\n");
}

export function rulesText(p: CreatorProfile) {
  return p.rules.length ? p.rules.map((r) => `- ${r.text}`).join("\n") : "None yet.";
}

/** The prompt for this creator. Logged in development (and when SCRIPTS_LOG_PROMPT=1) so the rules can be seen going in. */
export function scriptSystemPrompt(p: CreatorProfile) {
  const system = loadTemplate()
    .replace("{{creator_profile}}", () => profileText(p))
    .replace("{{creator_rules}}", () => rulesText(p));
  if (process.env.NODE_ENV !== "production" || process.env.SCRIPTS_LOG_PROMPT === "1") console.info(`Creator Desk scripts: system prompt\n${system}`);
  return system;
}

/** The request, as Claude reads it. */
export function requestText(r: ScriptRequest, briefText: string, files: string[]) {
  const [lo, hi] = WORDS[r.length];
  return [
    "Script request",
    `Brand: ${r.brand}`,
    `Product: ${r.product}`,
    `Length: ${r.length}s (${lo}-${hi} spoken words)`,
    `Format: ${given(r.format, "Not said.")}`,
    `Where it's going: ${given(r.destination, "Not said.")}`,
    `Must say: ${given(r.mustSay, "Nothing given.")}`,
    `Must not say: ${given(r.mustNotSay, "Nothing given.")}`,
    `The creator's real experience with the product:\n${given(r.experience, "Not given.")}`,
    `The brief:\n${briefText.trim() || (files.length ? "(see the attached files)" : "No brief given.")}`,
    files.length ? `Attached files: ${files.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
