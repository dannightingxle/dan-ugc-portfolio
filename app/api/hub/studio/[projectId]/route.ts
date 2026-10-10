import { crossSite } from "../../../../hub/_lib/same-origin";
import { claudeEnabled, getWorkspace, listSheets, saveWorkspace, studioApiUser, validProjectId } from "../../../../hub/_lib/studio/data";
import { WorkspaceBody, studioAction } from "../../../../hub/_lib/studio/request";

/* A job's Studio workspace (owners only): GET it with its shoot sheets, PUT edits. */

export async function GET(_request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]">) {
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  const { projectId } = await ctx.params;
  if (!validProjectId(projectId)) return Response.json({ error: "Unknown job." }, { status: 400 });
  const [workspace, sheets] = await Promise.all([getWorkspace(auth.user.id, projectId), listSheets(auth.user.id, projectId)]);
  return Response.json({ workspace, sheets, claude: claudeEnabled });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/hub/studio/[projectId]">) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const { projectId } = await ctx.params;
  return studioAction(request, projectId, WorkspaceBody, ({ user, body }) => saveWorkspace(user.id, projectId, body), { needsClaude: false });
}
