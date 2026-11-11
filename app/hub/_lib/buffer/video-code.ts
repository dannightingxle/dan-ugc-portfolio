// Reading a finished video's code out of its file name. Pure, so it can be tested on its own.
//
// "TrueCurrent V102 v2.mp4" is video V102, edit version 2: the code is the FIRST V/T number in the name, and any
// V number after it is a CapCut edit version (v2, v3 … v100), which never changes the caption. Codes run past 99.

const CODE = /\b([VT]\d{1,3})\b/gi;

/** Every V/T number in the name, in order, upper-cased: "TrueCurrent V102 v2" → ["V102", "V2"]. */
const codesIn = (s: string) => [...s.matchAll(CODE)].map((m) => m[1].toUpperCase());

/** The video's code: the first V/T number. "TrueCurrent V102 v2" → "V102"; "SOL V3" → "V3"; "Intro" → "". */
export const videoCode = (s: string) => codesIn(s)[0] ?? "";

/** The name without a trailing edit version, so "TrueCurrent V102 v2" finds the draft called "TrueCurrent V102". */
export function withoutVersion(s: string) {
  if (codesIn(s).length < 2) return s;
  return s.replace(/[\s-]*\bv\d{1,3}$/i, "").trim();
}
