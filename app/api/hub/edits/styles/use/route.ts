import { z } from "zod";
import { editStyleId, setEditStyle } from "../../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editableProject, editsApi } from "../../../../../hub/_lib/edits/request";
import { listStyles, scopeStyle, validStyleId } from "../../../../../hub/_lib/edits/styles";

/* Which edit style a job's (or the personal brand's) edits follow: GET ?scope=
   says which (and lists them all to choose from), PATCH picks one ("" goes
   back to the default for that kind of job). */

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  return editsApi(request, null, async ({ user }) => {
    if (!editableProject(scope)) throw new BadRequest("Unknown job.");
    return scopeStyle(user.id, scope, await editStyleId(user.id, scope));
  });
}

export async function PATCH(request: Request) {
  return editsApi(request, z.object({ scope: z.string(), styleId: z.string().max(40) }), async ({ user, body }) => {
    if (!editableProject(body.scope)) throw new BadRequest("Unknown job.");
    if (body.styleId && !(validStyleId(body.styleId) && (await listStyles(user.id)).some((s) => s.id === body.styleId))) throw new NotFound("That style isn't there any more.");
    await setEditStyle(user.id, body.scope, body.styleId);
    return scopeStyle(user.id, body.scope, body.styleId);
  });
}
