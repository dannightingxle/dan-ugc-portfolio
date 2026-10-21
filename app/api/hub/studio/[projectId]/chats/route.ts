import { crossSite } from "../../../../../hub/_lib/same-origin";
import { deleteChat, getChat, listChats } from "../../../../../hub/_lib/studio/chats";
import { studioApiUser, validProjectId } from "../../../../../hub/_lib/studio/data";

/* A job's shoot sheet chats: GET the list, GET ?id= one chat, DELETE ?id= one. */

export async function GET(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/chats">) {
  const { projectId } = await ctx.params;
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  if (!validProjectId(projectId)) return Response.json({ error: "Unknown job." }, { status: 400 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ chats: await listChats(auth.user.id, projectId) });
  const chat = await getChat(auth.user.id, projectId, id);
  if (!chat) return Response.json({ error: "That chat's gone." }, { status: 404 });
  // The page only needs the names of what was attached.
  const { input, ...rest } = chat;
  return Response.json({ chat: { ...rest, attached: input.uploads.map((u) => u.name) } });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]/chats">) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const { projectId } = await ctx.params;
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  if (!validProjectId(projectId)) return Response.json({ error: "Unknown job." }, { status: 400 });
  await deleteChat(auth.user.id, projectId, new URL(request.url).searchParams.get("id") ?? "");
  return Response.json({ ok: true });
}
