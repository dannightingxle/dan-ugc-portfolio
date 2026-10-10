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
  return (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY
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

export async function ask<S extends z.ZodType>({ system, context, content, schema, webFetch, effort = "medium" }: Ask<S>): Promise<z.infer<S>> {
  const systemBlocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
  if (context) systemBlocks.push({ type: "text", text: context, cache_control: { type: "ephemeral" } });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  // Just the JSON schema: the answer is parsed below, once Claude has actually finished
  // (the SDK's auto-parse would also try to parse a paused turn).
  const { type, schema: jsonSchema } = zodOutputFormat(schema);

  // A turn that uses web fetch can pause; send it back to carry on (a few times at most).
  for (let turn = 0; turn < 4; turn++) {
    const stream = anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      // If a safety check declines, the API retries on a suitable model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type, schema: jsonSchema } },
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
    try {
      return schema.parse(JSON.parse(text));
    } catch {
      throw new StudioError("Claude's answer came back incomplete. Please try again.");
    }
  }
  throw new StudioError("Opening the links took too long. Paste the brief text in instead.");
}

/** Turn any failure into a message for the page. */
export function studioErrorMessage(e: unknown) {
  if (e instanceof StudioError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The Claude API key isn't working. Check ANTHROPIC_API_KEY in Vercel.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now. Try again in a minute.";
  if (e instanceof Anthropic.APIError) return `Claude had a problem (${e.status ?? "network"}). Try again in a minute.`;
  return "Something went wrong. Please try again.";
}
