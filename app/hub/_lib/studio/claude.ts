import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/* One call to Claude with a structured (schema-checked) answer. The stable
   method text goes first and the job's workspace second, both cached, so a
   week of requests against the same job mostly reads from the cache. */

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function anthropic() {
  // Reads ANTHROPIC_API_KEY. A key made outside a workspace also needs the workspace to bill (ANTHROPIC_WORKSPACE_ID).
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return (client ??= new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}));
}

/** A problem worth showing as-is. */
export class StudioError extends Error {}

type Ask<S extends z.ZodType> = {
  system: string;
  /** The job's workspace (instructions + files), cached as its own block. */
  context?: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  /** Let Claude open links in the material (briefs on notion.site, Google Docs…). */
  webFetch?: boolean;
  effort?: "low" | "medium" | "high";
};

export async function ask<S extends z.ZodType>(req: Ask<S>): Promise<z.infer<S>> {
  try {
    return await askOnce(req, true);
  } catch (e) {
    // The API can turn down a response format it can't compile (a big or complex
    // schema): ask again with the shape spelled out in the prompt instead, and
    // check the answer against it here.
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    console.warn("Creator Desk studio: structured output refused, retrying with the shape in the prompt:", e.message);
    return askOnce(req, false);
  }
}

async function askOnce<S extends z.ZodType>({ system, context, content, schema, webFetch, effort = "medium" }: Ask<S>, structured: boolean): Promise<z.infer<S>> {
  const systemBlocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  if (context) systemBlocks.push({ type: "text", text: context, cache_control: { type: "ephemeral" } });
  // Just the JSON schema: the answer is parsed below, once Claude has actually finished
  // (the SDK's auto-parse would also try to parse a paused turn).
  const { type, schema: jsonSchema } = zodOutputFormat(schema);
  const shape: Anthropic.Beta.BetaContentBlockParam[] = structured
    ? []
    : [{ type: "text", text: `Reply with only a JSON object (no other text, no code fences) that matches this JSON schema:\n${JSON.stringify(jsonSchema)}` }];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: [...content, ...shape] }];

  // A turn that uses web fetch can pause; send it back to carry on (a few times at most).
  // An answer that doesn't fit the shape gets one go at fixing it, as you'd ask in a chat.
  let fixed = false;
  for (let turn = 0; turn < 5; turn++) {
    const stream = anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      // If a safety check declines, the API retries on a suitable model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: structured ? { effort, format: { type, schema: jsonSchema } } : { effort },
      system: systemBlocks,
      messages,
      ...(webFetch && { tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 12 }] }),
    });
    const msg = await stream.finalMessage();
    console.info("Creator Desk studio: Claude usage", JSON.stringify(msg.usage));

    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "refusal") throw new StudioError("Claude couldn't help with that one. Try rewording, or take out anything unusual from the material.");
    if (msg.stop_reason === "max_tokens") throw new StudioError("That was too much to write in one go. Try fewer videos.");
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const read = readAnswer(schema, structured ? text : jsonPart(text));
    if (read.ok) return read.data;
    console.warn("Creator Desk studio: answer didn't fit the shape:", read.problem, text.slice(0, 500));
    if (fixed) throw new StudioError(`Claude's answer didn't come back in the right shape (${read.problem}). Please try again.`);
    fixed = true;
    if (text.trim()) {
      messages.push({ role: "assistant", content: [{ type: "text", text }] });
      messages.push({
        role: "user",
        content: [{ type: "text", text: `That reply didn't fit the required JSON shape: ${read.problem}. Reply again with only the complete, corrected JSON object - nothing else.` }],
      });
    }
  }
  throw new StudioError("Opening the links took too long. Paste the brief text in instead.");
}

/** The answer checked against the shape, or what's wrong with it in a few words. */
function readAnswer<S extends z.ZodType>(schema: S, text: string): { ok: true; data: z.infer<S> } | { ok: false; problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problem: text.trim() ? "it wasn't complete, valid JSON" : "it was empty" };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "the answer"}: ${i.message}`);
  return { ok: false, problem: issues.join("; ") };
}

/** The JSON object in a reply, even if it came wrapped in a code fence or a sentence. */
function jsonPart(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** The API's own explanation of an error, without the status code and request id around it. */
function apiReason(e: InstanceType<typeof Anthropic.APIError>) {
  const err = (e.error as { error?: { message?: unknown } } | undefined)?.error;
  return (typeof err?.message === "string" ? err.message : e.message).slice(0, 300);
}

/** Turn any failure into a message for the page. */
export function studioErrorMessage(e: unknown) {
  if (e instanceof StudioError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The Claude API key isn't working. Check ANTHROPIC_API_KEY in Vercel.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a minute.";
  // Claude's own reason, so a request it turns down can be fixed rather than retried blindly.
  if (e instanceof Anthropic.BadRequestError && /anthropic-workspace-id/i.test(apiReason(e))) {
    return "Your Claude API key isn't linked to a workspace. Add ANTHROPIC_WORKSPACE_ID in Vercel (the workspace's ID from console.anthropic.com, starting wrkspc_), or use a key made inside a workspace.";
  }
  if (e instanceof Anthropic.BadRequestError) return `Claude turned the request down: ${apiReason(e)}`;
  if (e instanceof Anthropic.APIError) return `Claude had a problem (${e.status ?? "network"}). Try again in a minute.`;
  return "Something went wrong. Please try again.";
}
