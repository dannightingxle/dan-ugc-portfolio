import { brandKey } from "./import-jobs";
import { weekDataBlock } from "./studio/custom-template";
import type { Project } from "./store";

/* Bringing Claude Projects in from a Claude data export (Settings > Privacy >
   Export data). The export is read in the browser: only the projects are
   opened - chats are skipped and never leave the computer. Each project's
   instructions and files become a job's Studio workspace, the same way they
   worked in Claude. */

export type ClaudeDoc = { filename: string; content: string };
export type ClaudeProject = { uuid: string; name: string; description: string; instructions: string; docs: ClaudeDoc[] };

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function toProject(raw: unknown): ClaudeProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Raw;
  const name = str(p.name).trim();
  const docs = (Array.isArray(p.docs) ? p.docs : [])
    .map((d) => d as Raw)
    .filter((d) => d && str(d.content).trim())
    .map((d) => ({ filename: str(d.filename).trim() || "file", content: str(d.content) }));
  const instructions = str(p.prompt_template).trim();
  if (!name || (!docs.length && !instructions)) return null;
  return { uuid: str(p.uuid) || name, name, description: str(p.description).trim(), instructions, docs };
}

/** Every project in a JSON file from the export: a list of them, one on its own, or {projects: [...]}. */
function projectsIn(json: unknown): ClaudeProject[] {
  const list = Array.isArray(json) ? json : json && typeof json === "object" && Array.isArray((json as Raw).projects) ? ((json as Raw).projects as unknown[]) : [json];
  return list.map(toProject).filter((p): p is ClaudeProject => Boolean(p));
}

// Chats, account details and memories are never opened.
const SKIP = /(^|\/)(conversations|users|memories)[^/]*\.json$/i;

/** Read a Claude export (.zip) or a projects .json file. */
export async function readClaudeExport(file: File): Promise<ClaudeProject[]> {
  const found: ClaudeProject[] = [];
  if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
    const { unzipSync, strFromU8 } = await import("fflate");
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /\.json$/i.test(f.name) && !SKIP.test(f.name) && !f.name.startsWith("__MACOSX/") });
    } catch {
      throw new Error("That zip couldn't be opened. Choose the zip Claude emailed you, as it came.");
    }
    for (const [name, data] of Object.entries(files)) {
      try {
        found.push(...projectsIn(JSON.parse(strFromU8(data))));
      } catch {
        console.warn("Creator Desk: skipped", name);
      }
    }
  } else {
    try {
      found.push(...projectsIn(JSON.parse(await file.text())));
    } catch {
      throw new Error("That file isn't a Claude export. Choose the .zip Claude emailed you, or the projects .json file from inside it.");
    }
  }
  // The same project can be in a file twice (a re-export): keep one.
  const seen = new Set<string>();
  return found.filter((p) => !seen.has(p.uuid) && Boolean(seen.add(p.uuid))).sort((a, b) => a.name.localeCompare(b.name));
}

/** "Tech UGC - SOL" is the SOL job; emoji and the tech UGC prefix are dropped. */
export function brandFromName(name: string) {
  return (
    name
      .replace(/\p{Extended_Pictographic}|️/gu, "")
      .replace(/^\s*(tech\s*)?ugc\s*[-–—:·|]\s*/i, "")
      .trim() || name.trim()
  );
}

export const isTechProject = (name: string) => /\btech\b/i.test(name);

/** The board job a project most likely belongs to: same brand. */
export function matchJob(p: ClaudeProject, projects: Project[]): Project | undefined {
  const key = brandKey(brandFromName(p.name));
  if (!key) return undefined;
  const same = projects.filter((j) => brandKey(j.brand) === key);
  return same.find((j) => j.techStage) ?? same[0];
}

const NAMED: [RegExp, "brief" | "appNotes" | "references" | "winners" | "scriptBank" | "template"][] = [
  [/^brief$/, "brief"],
  [/^app[-_ ]?notes?$/, "appNotes"],
  [/^references?$/, "references"],
  [/^winners?$/, "winners"],
  [/^script[-_ ]?bank$/, "scriptBank"],
  [/^shoot[-_ ]?sheet[-_ ]?template$/, "template"],
];

/** "claude/script-bank.md" -> "script-bank". */
const baseName = (filename: string) =>
  filename
    .replace(/^.*\//, "")
    .replace(/\.(md|txt|html?|json)$/i, "")
    .trim()
    .toLowerCase();

/** Where each of a project's files will go. */
export function mapDocs(p: ClaudeProject) {
  const files: Record<string, string> = {};
  const other: ClaudeDoc[] = [];
  for (const d of p.docs) {
    const key = NAMED.find(([re]) => re.test(baseName(d.filename)))?.[1];
    // A template only counts if its week data can be filled in; otherwise it's kept as a file.
    if (key && !files[key] && (key !== "template" || weekDataBlock(d.content))) files[key] = d.content.trim();
    else other.push(d);
  }
  return { files, other };
}

/** A project as an import job (for planImport): its instructions and files go into the job's Studio workspace. */
export function projectToJob(p: ClaudeProject, target: { id: string } | { new: true }): Raw {
  const { files, other } = mapDocs(p);
  // Files with no place of their own (e.g. "formats") are kept with the references, under their own name.
  const references = [files.references, ...other.map((d) => `## File: ${baseName(d.filename)}\n\n${d.content.trim()}`)].filter(Boolean).join("\n\n");
  return {
    ...("id" in target ? { id: target.id } : { new: true, notes: p.description }),
    brand: brandFromName(p.name),
    ...(isTechProject(p.name) ? { kind: "tech" } : {}),
    instructions: p.instructions,
    ...files,
    references,
    replaceShorter: true,
  };
}
