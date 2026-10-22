import { crossSite } from "../../../../hub/_lib/same-origin";
import { claudeEnabled, getWorkspace, listSheets, saveWorkspace, studioApiUser, validProjectId } from "../../../../hub/_lib/studio/data";
import { WorkspaceBody, studioAction } from "../../../../hub/_lib/studio/request";
import { cleanHandle } from "../../../../hub/_lib/studio/brand-types";

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
  return studioAction(
    request,
    projectId,
    WorkspaceBody,
    async ({ user, body }) => {
      const saved = body.template === undefined || body.account.profiles === undefined || body.filmingOn === undefined ? await getWorkspace(user.id, projectId) : null;
      return saveWorkspace(user.id, projectId, {
        ...body,
        template: body.template ?? saved!.template,
        filmingOn: body.filmingOn ?? saved!.filmingOn,
        // A row still being typed (no handle yet) isn't saved.
        account: { ...body.account, profiles: (body.account.profiles ?? saved!.account.profiles).map((p) => ({ platform: p.platform, handle: cleanHandle(p.handle) })).filter((p) => p.handle) },
      });
    },
    { needsClaude: false },
  );
}
