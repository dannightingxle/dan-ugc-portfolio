import { type Length, type ScriptPack, type ScriptRequest, wordRange } from "./types";

/* The checks run on every pack Claude writes (docs/scripting-build-brief.md,
   "Checks in code"). A pack that fails is sent back once with what failed;
   one that still fails is shown with a warning. */

/** Everything from the prompt's "Never use" section that code can spot, in one place. Each is checked in what's said
    and what's on screen (the hooks, the spoken lines and the edit map). */
export const BANNED: { label: string; pattern: RegExp }[] = [
  {
    label: '"Fast. Easy. Delicious." style fragments',
    pattern: /\b[\p{L}']+[.!]\s+[\p{L}']+[.!]\s+[\p{L}']+[.!]/u,
  },
  { label: "\"It's not just X, it's Y\"", pattern: /\bit['’]?s not just\b/i },
  { label: '"More than just a…"', pattern: /\bmore than just\b/i },
  { label: '"game-changer"', pattern: /\bgame[- ]?chang/i },
  { label: '"revolutionary"', pattern: /\brevolutionary\b/i },
  { label: '"amazing"', pattern: /\bamazing\b/i },
  { label: '"incredible"', pattern: /\bincredibl/i },
  { label: '"life-changing"', pattern: /\blife[- ]?chang/i },
  { label: '"must-have"', pattern: /\bmust[- ]?haves?\b/i },
  { label: '"elevate"', pattern: /\belevat/i },
  { label: '"unlock"', pattern: /\bunlock/i },
  { label: '"seamless"', pattern: /\bseamless/i },
  { label: '"Imagine…"', pattern: /(^|[.!?]\s+)imagine\b/i },
  { label: '"Say goodbye to…"', pattern: /\bsay goodbye to\b/i },
  {
    label: `"In today's fast-paced world"`,
    pattern: /\bfast[- ]paced world\b/i,
  },
  { label: '"Trust me"', pattern: /\btrust me\b/i },
  { label: `"Let's dive in"`, pattern: /\blet['’]?s dive in\b/i },
];

// Number words, for the captions (on-screen text should read as numbers).
const NUMBER_WORDS = [
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "hundred",
];
// "One" is only a number when it counts something ("one scoop"), not in "the caramel one" or "one of".
const COUNTED =
  /^(second|minute|hour|day|week|month|year|time|thing|step|scoop|pot|cup|bottle|pack|box|tub|bag|sachet|serving|tip|trick|reason|swap|habit|ingredient|product|app|video|thing)s?$/i;

/** Number words in a caption, leaving out proper nouns: anything capitalised mid-sentence, and the brand's own names. */
export function numberWords(text: string, names: string) {
  const own = new Set(names.toLowerCase().match(/[\p{L}]+/gu) ?? []);
  const words = [...text.matchAll(/[\p{L}']+/gu)];
  const found: string[] = [];
  words.forEach((m, i) => {
    const word = m[0];
    const low = word.toLowerCase();
    const isNumber = NUMBER_WORDS.includes(low) || (low === "one" && COUNTED.test(words[i + 1]?.[0] ?? ""));
    if (!isNumber || own.has(low)) return;
    const before = text.slice(0, m.index).trimEnd();
    const startsSentence = !before || /[.!?:]$/.test(before);
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase() && !startsSentence) return; // A proper noun.
    found.push(word);
  });
  return found;
}

export const spokenWords = (pack: ScriptPack) =>
  pack.sections
    .flatMap((s) => s.lines)
    .join(" ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** What failed, in words (empty when it all passes). A pack that only asks questions has nothing to check. */
export function checkPack(pack: ScriptPack, req: Pick<ScriptRequest, "brand" | "product" | "mustSay" | "length">): string[] {
  if (pack.questions.length) return [];
  const failed: string[] = [];

  // Dashes, anywhere in the pack.
  const everything = JSON.stringify(pack);
  if (/[—–]/.test(everything)) failed.push("It uses an em dash or en dash. Use a full stop, a comma or a simple hyphen.");

  // Banned phrases, in what's said and what's on screen.
  const said = [...pack.hooks.map((h) => h.text), ...pack.sections.flatMap((s) => s.lines), ...pack.edit_map.flatMap((r) => [r.line, r.on_screen_text])];
  const sectionText = pack.sections.map((s) => s.lines.join(" "));
  const hits = BANNED.filter((b) => [...said, ...sectionText].some((t) => b.pattern.test(t))).map((b) => b.label);
  if (hits.length) failed.push(`It uses banned phrases: ${hits.join(", ")}.`);

  // Captions read as numbers.
  const names = [req.brand, req.product, req.mustSay].join(" ");
  const words = [...new Set(pack.edit_map.flatMap((r) => numberWords(r.on_screen_text, names)))];
  if (words.length) failed.push(`The on-screen text writes numbers as words (${words.join(", ")}). Use digits, e.g. 3 not three.`);

  // Length.
  const [lo, hi] = wordRange(req.length as Length);
  const count = spokenWords(pack);
  if (count < lo || count > hi) failed.push(`The spoken lines are ${count} words. A ${req.length}s script needs ${lo}-${hi}.`);

  // Hooks and the edit map.
  if (pack.hooks.length !== 3) failed.push(`It has ${pack.hooks.length} hook${pack.hooks.length === 1 ? "" : "s"}. It needs exactly 3.`);
  const codes = new Set(pack.shot_list.flatMap((l) => l.shots.map((s) => s.code.trim().toUpperCase())));
  const missing = [
    ...new Set(
      pack.edit_map
        .flatMap((r) =>
          r.shot
            .split(/[,+/&]|\band\b/i)
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean),
        )
        .filter((c) => !codes.has(c)),
    ),
  ];
  if (missing.length) failed.push(`The edit map uses shot codes that aren't in the shot list: ${missing.join(", ")}.`);

  // The CTA is an instruction.
  const cta = pack.sections.filter((s) => s.label === "CTA").flatMap((s) => s.lines);
  if (cta.length && /\?\s*$/.test(cta[cta.length - 1])) failed.push("The CTA is a question. Make it an instruction.");
  return failed;
}
