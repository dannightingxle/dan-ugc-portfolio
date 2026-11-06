import "server-only";
import { randomUUID } from "node:crypto";
import type { HubUser } from "../supabase/server";
import { StudioError, ask } from "../studio/claude";
import { readMaterial, type Upload } from "../studio/jobs";
import type { Progress } from "../studio/tasks";
import { checkPack } from "./checks";
import { getProfile, getScript, saveScript } from "./data";
import { requestText, scriptSystemPrompt } from "./prompt";
import { type Answer, type Feedback, type Script, ScriptPack, type ScriptRequest, type ScriptVersion } from "./types";

/* Writing a script: the request (and its brief, links, files and videos) goes
   to Claude with the scriptwriting prompt; the pack that comes back is
   checked, and sent back once with what failed if anything did. Answers to
   its questions and "Not right?" feedback each make a new version. */

export type ScriptRun = {
  scriptId?: string;
  request?: ScriptRequest;
  uploads?: Upload[];
  answers?: Answer[];
  feedback?: Feedback;
};
export type ScriptRunResult = {
  scriptId: string;
  versionId: string;
  title: string;
  questions: number;
  failed: number;
};

function titleFor(r: ScriptRequest) {
  const name = r.product.toLowerCase().includes(r.brand.toLowerCase()) ? r.product : `${r.brand} ${r.product}`;
  return `${name.trim()} · ${r.length}s`;
}

const json = (pack: ScriptPack) => JSON.stringify(pack, null, 1);

export async function runScript(user: HubUser, scope: string, run: ScriptRun, progress: Progress = () => {}): Promise<ScriptRunResult> {
  const now = new Date().toISOString();
  let script: Script & { uploads: Upload[] };
  if (run.scriptId) {
    const found = await getScript(user.id, scope, run.scriptId);
    if (!found) throw new StudioError("That script's been deleted.");
    script = found;
  } else {
    if (!run.request) throw new StudioError("Say which brand and product it's for.");
    const uploads = run.uploads ?? [];
    script = {
      id: randomUUID(),
      title: titleFor(run.request),
      createdAt: now,
      updatedAt: now,
      request: run.request,
      files: uploads.map((u) => u.name),
      uploads,
      versions: [],
    };
  }
  const req = script.request;
  const previous = script.versions[0] ?? null;
  const profile = await getProfile(user);
  const system = scriptSystemPrompt(profile);
  const read = await readMaterial(user, req.brief, script.uploads, progress);

  // Every answer given so far, oldest first, then the new ones.
  const answers = [...[...script.versions].reverse().flatMap((v) => v.answers), ...(run.answers ?? [])].filter((a) => a.answer.trim());
  const parts = [requestText(req, read.text, script.files), read.unread];
  if (answers.length) parts.push(`Answers to your questions:\n${answers.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join("\n\n")}`);
  if (run.feedback && previous) {
    const said = [...run.feedback.picks, run.feedback.text.trim()].filter(Boolean).join(". ");
    parts.push(`The creator says the previous version isn't right. Their feedback: ${said}\n\nThe previous version:\n${json(previous.pack)}`);
  }
  const content = [...read.blocks, { type: "text" as const, text: parts.filter(Boolean).join("\n\n") }];
  const write = (extra?: string) =>
    ask({
      system,
      content: extra ? [...content, { type: "text" as const, text: extra }] : content,
      schema: ScriptPack,
      webFetch: read.webFetch,
      effort: "high",
      onFixUp: () => progress("Claude is fixing its answer"),
    });

  progress(run.feedback ? "Claude is rewriting it" : "Claude is writing the script");
  let pack = await write();
  let failed = checkPack(pack, req);
  let retried = false;
  // One retry at most, with what failed.
  if (failed.length) {
    console.info("Creator Desk scripts: checks failed, retrying once:", failed.join(" | "));
    progress("Fixing what didn't pass the checks");
    retried = true;
    pack = await write(
      `Your last version failed these checks:\n${failed.map((f) => `- ${f}`).join("\n")}\n\nHere it is:\n${json(pack)}\n\nWrite it again so it passes every check. Keep what works.`,
    );
    failed = checkPack(pack, req);
  }

  const version: ScriptVersion = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    from: run.feedback ? "feedback" : run.answers?.length ? "answers" : "request",
    answers: run.answers ?? [],
    feedback: run.feedback ?? null,
    pack,
    failed,
    retried,
  };
  // Saved onto the script as it is now (a script deleted meanwhile stays deleted).
  const latest = run.scriptId ? await getScript(user.id, scope, script.id) : script;
  if (!latest) throw new StudioError("That script's been deleted.");
  await saveScript(user.id, scope, {
    ...latest,
    versions: [version, ...latest.versions],
    updatedAt: version.createdAt,
  });
  return {
    scriptId: script.id,
    versionId: version.id,
    title: script.title,
    questions: pack.questions.length,
    failed: failed.length,
  };
}
