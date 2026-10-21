import { z } from "zod";
import { addNotes, editNotes, saveNotes } from "../../../../hub/_lib/edits/data";
import { BadRequest, NotFound, editsApi, validScope } from "../../../../hub/_lib/edits/request";
import { ALL_EDITS } from "../../../../hub/_lib/edits/types";

/* Your editing notes: feedback Claude follows on every future edit, for one job
   (or the personal brand) or for all your edits (scope "_all"). GET them (with
   the notes for all edits too), POST one you've written, PATCH one's wording,
   DELETE ?scope=&id= one. */

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  return editsApi(request, null, async ({ user }) => {
    if (!validScope(scope)) throw new BadRequest("Unknown job.");
    const [own, all] = await Promise.all([editNotes(user.id, scope), scope === ALL_EDITS ? null : editNotes(user.id, ALL_EDITS)]);
    return { ...own, all: all?.notes ?? [] };
  });
}

const Note = z.object({ scope: z.string(), text: z.string().trim().min(1, "Write the note first.").max(500) });

export async function POST(request: Request) {
  return editsApi(request, Note, async ({ user, body }) => {
    if (!validScope(body.scope)) throw new BadRequest("Unknown job.");
    await addNotes(user.id, body.scope, [body.text], "you");
    return editNotes(user.id, body.scope);
  });
}

export async function PATCH(request: Request) {
  return editsApi(request, Note.extend({ id: z.string().max(40) }), async ({ user, body }) => {
    if (!validScope(body.scope)) throw new BadRequest("Unknown job.");
    const { notes } = await editNotes(user.id, body.scope);
    if (!notes.some((n) => n.id === body.id)) throw new NotFound("That note isn't there any more.");
    return saveNotes(user.id, body.scope, { notes: notes.map((n) => (n.id === body.id ? { ...n, text: body.text } : n)) });
  });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope"), id = params.get("id");
  return editsApi(request, null, async ({ user }) => {
    if (!validScope(scope)) throw new BadRequest("Unknown job.");
    const { notes } = await editNotes(user.id, scope);
    return saveNotes(user.id, scope, { notes: notes.filter((n) => n.id !== id) });
  });
}
