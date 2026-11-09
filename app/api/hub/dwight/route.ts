import { z } from "zod";
import { crossSite } from "../../../hub/_lib/same-origin";
import { claudeEnabled, studioApiUser } from "../../../hub/_lib/studio/data";
import { SILENT_MS, ask } from "../../../hub/_lib/dwight/agent";
import { deleteConversation, dwightName, getConversation, getUndo, listConversations, setDwightName } from "../../../hub/_lib/dwight/data";

/* Dwight, the helper on every page.
   GET: your conversations (newest first) and its name; ?id= one conversation.
   POST {text, page, conversationId?}: ask; the reply is written in the
   background (GET ?id= to follow it). PUT {name}: rename it. DELETE ?id=. */
export const maxDuration = 800;

const Ask = z.object({
  conversationId: z.string().uuid().optional(),
  text: z.string().trim().min(1, "Type something first.").max(50_000),
  page: z.object({ path: z.string().max(300), title: z.string().max(300) }),
});

export async function GET(request: Request) {
  const auth = await studioApiUser("dwight");
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ name: await dwightName(auth.user.id), conversations: await listConversations(auth.user.id) });
  const [convo, undo] = await Promise.all([getConversation(auth.user.id, id), getUndo(auth.user.id)]);
  if (!convo) return Response.json({ error: "That conversation's gone." }, { status: 404 });
  const silent = Date.now() - Date.parse(convo.updatedAt) > SILENT_MS;
  return Response.json({
    ...convo,
    messages: convo.messages.map((m) => {
      // A reply that stopped being written (the server running it was cut off).
      if (m.status === "working" && silent) return { ...m, status: "failed", text: "That stopped partway. Nothing more is happening on it - ask again." };
      return { ...m, canUndo: Boolean(m.changes?.length && !m.undone && undo?.conversationId === convo.id && undo.messageId === m.id) };
    }),
  });
}

export async function POST(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("dwight");
  if (!auth.ok) return auth.response;
  if (!claudeEnabled) return Response.json({ error: "Add ANTHROPIC_API_KEY in Vercel to switch on Claude." }, { status: 503 });
  const parsed = Ask.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  try {
    return Response.json(await ask(auth.user, await dwightName(auth.user.id), parsed.data));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send that." }, { status: 409 });
  }
}

export async function PUT(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("dwight");
  if (!auth.ok) return auth.response;
  const parsed = z.object({ name: z.string().trim().max(40) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Give it a name of up to 40 letters." }, { status: 400 });
  await setDwightName(auth.user.id, parsed.data.name);
  return Response.json({ name: await dwightName(auth.user.id) });
}

export async function DELETE(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser("dwight");
  if (!auth.ok) return auth.response;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Unknown conversation." }, { status: 400 });
  await deleteConversation(auth.user.id, id.data);
  return Response.json({ ok: true });
}
