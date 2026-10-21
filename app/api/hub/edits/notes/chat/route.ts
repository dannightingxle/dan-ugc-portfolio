import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminClient } from "../../../../../hub/_lib/supabase/admin";
import { editNotes, saveNotes } from "../../../../../hub/_lib/edits/data";
import { BadRequest, editsApi, validScope } from "../../../../../hub/_lib/edits/request";
import { ALL_EDITS, type EditNote } from "../../../../../hub/_lib/edits/types";
import { BRAND_ID, claudeEnabled } from "../../../../../hub/_lib/studio/data";
import { StudioError, ask, studioErrorMessage } from "../../../../../hub/_lib/studio/claude";

/* Feedback on how your videos are edited, in your own words: Claude turns it
   into clear rules in your editing notes (adding, rewording or dropping
   notes), and every edit from then on follows them. */

const SYSTEM = `You keep a video creator's editing notes: short standing rules that Claude Code follows every time it edits their videos in CapCut (captions, cuts and pacing, text on screen, zooms, music, B-roll, length, exports).

The creator gives you feedback in a chat, like they would to an editor. Update the notes to match:
- Add a rule for anything new. Make it specific and usable by an editor who's never met them ("Captions: white, bold, max 3 words per line, centred two-thirds down"), not vague ("make captions better").
- Reword a note the feedback changes, and drop one it contradicts or that they ask to drop.
- Keep every other note exactly as it is, in the same order. One line per note, starting with what it's about ("Captions:", "Cuts:", "Hook:").
- If you can't tell what they want, ask one short question in reply and leave the notes unchanged.
reply: one or two friendly sentences to the creator saying what you changed (or your question).
notes: the full updated list of notes for this scope.`;

const Answer = z.object({ reply: z.string(), notes: z.array(z.string()) });
const Body = z.object({ scope: z.string(), message: z.string().trim().min(1, "Write your feedback first.").max(5_000) });

async function scopeName(userId: string, scope: string) {
  if (scope === ALL_EDITS) return "all their edits (every job and their personal brand)";
  if (scope === BRAND_ID) return "their personal brand's edits";
  const { data } = await adminClient().from("hub_projects").select("data").eq("user_id", userId).eq("id", scope).maybeSingle<{ data: { brand?: string } }>();
  return `their edits for ${data?.data?.brand || "this job"} (a client job)`;
}

export async function POST(request: Request) {
  return editsApi(request, Body, async ({ user, body }) => {
    if (!validScope(body.scope)) throw new BadRequest("Unknown job.");
    if (!claudeEnabled) throw new BadRequest("Add ANTHROPIC_API_KEY in Vercel to switch on Claude.");
    const [{ notes, chat }, all, name] = await Promise.all([editNotes(user.id, body.scope), body.scope === ALL_EDITS ? null : editNotes(user.id, ALL_EDITS), scopeName(user.id, body.scope)]);
    const recent = chat.slice(-10).map((m) => `${m.role === "you" ? "Creator" : "You"}: ${m.text}`).join("\n");
    let answer: z.infer<typeof Answer>;
    try {
      answer = await ask({
        system: SYSTEM,
        content: [
          {
            type: "text",
            text: [
              `These notes are for ${name}.`,
              `Current notes:${notes.length ? notes.map((n, i) => `\n${i + 1}. ${n.text}`).join("") : " (none yet)"}`,
              all?.notes.length ? `Notes for all their edits (these apply too; don't repeat them here):\n${all.notes.map((n) => `- ${n.text}`).join("\n")}` : "",
              recent && `The chat so far:\n${recent}`,
              `Their feedback:\n<feedback>\n${body.message}\n</feedback>`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        schema: Answer,
        effort: "low",
      });
    } catch (e) {
      throw new BadRequest(e instanceof StudioError ? e.message : studioErrorMessage(e));
    }
    // Notes that didn't change keep when (and how) they were first saved.
    const now = new Date().toISOString();
    const next: EditNote[] = answer.notes
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => notes.find((n) => n.text === text) ?? { id: randomBytes(6).toString("hex"), text: text.slice(0, 500), at: now, from: "chat" as const });
    return saveNotes(user.id, body.scope, {
      notes: next,
      chat: [...chat, { role: "you", text: body.message, at: now }, { role: "claude", text: answer.reply.trim(), at: now }],
    });
  });
}
