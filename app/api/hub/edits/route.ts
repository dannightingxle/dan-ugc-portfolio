import { z } from "zod";
import { createEdit, listDevices, listDeviceFiles, listEdits } from "../../../hub/_lib/edits/data";
import { briefFromSheet } from "../../../hub/_lib/edits/types";
import { BadRequest, NotFound, editsApi, text, validProjectId } from "../../../hub/_lib/edits/request";
import { getSheet } from "../../../hub/_lib/studio/data";

/* A job's edit cards (with the connected Macs and their recent clips), and adding cards:
   from a shoot sheet (one card per video) or from pasted "Copy everything" text. */

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  return editsApi(request, null, async ({ user }) => {
    if (!validProjectId(projectId)) throw new BadRequest("Unknown job.");
    const [edits, devices, files] = await Promise.all([listEdits(user.id, projectId), listDevices(user.id), listDeviceFiles(user.id)]);
    return { edits, devices, files };
  });
}

const Body = z.object({
  projectId: z.string(),
  sheetId: z.string().uuid().optional(),
  videoCode: text(20),
  title: text(300),
  brief: text(100_000),
});

export async function POST(request: Request) {
  return editsApi(request, Body, async ({ user, body }) => {
    if (!validProjectId(body.projectId)) throw new BadRequest("Unknown job.");
    if (body.sheetId) {
      const sheet = await getSheet(user.id, body.sheetId);
      if (!sheet || sheet.project_id !== body.projectId) throw new NotFound("That shoot sheet isn't there any more.");
      const videos = body.videoCode ? sheet.data.videos.filter((v) => v.code === body.videoCode) : sheet.data.videos;
      if (!videos.length) throw new NotFound("That video isn't on the shoot sheet.");
      const edits = [];
      for (const v of videos) edits.push(await createEdit(user.id, { projectId: body.projectId, sheetId: sheet.id, videoCode: v.code, title: v.title, brief: briefFromSheet(sheet.data, v.code) }));
      return { edits };
    }
    if (!body.brief.trim()) throw new BadRequest("Paste the video card first.");
    // Pasted cards: take the code and title from the first line if there is one ("V3 · Riff: …").
    const first = body.brief.trim().split("\n")[0].slice(0, 200);
    const m = /^(V\d+)\s*[·:-]\s*(.+)$/.exec(first);
    const edit = await createEdit(user.id, {
      projectId: body.projectId,
      videoCode: body.videoCode || m?.[1] || "",
      title: body.title || m?.[2] || first,
      brief: body.brief.trim(),
    });
    return { edits: [edit] };
  });
}
