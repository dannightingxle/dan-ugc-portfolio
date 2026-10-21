import { crossSite } from "../../../../hub/_lib/same-origin";
import { adminClient } from "../../../../hub/_lib/supabase/admin";
import { studioApiUser } from "../../../../hub/_lib/studio/data";
import { dismissTask, listTasks } from "../../../../hub/_lib/studio/tasks";

/* Studio's background jobs: GET the running and recently finished ones (with
   each job's brand name), DELETE ?id= to clear a finished one. */

export async function GET() {
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  try {
    const tasks = await listTasks(auth.user.id);
    const ids = [...new Set(tasks.map((t) => t.projectId))];
    const { data } = ids.length ? await adminClient().from("hub_projects").select("id, data").eq("user_id", auth.user.id).in("id", ids) : { data: [] };
    const brands = new Map((data ?? []).map((p) => [p.id as string, String((p.data as { brand?: string })?.brand || "Job")]));
    return Response.json({ tasks: tasks.map((t) => ({ ...t, brand: brands.get(t.projectId) ?? "Job" })) });
  } catch (e) {
    console.error("Creator Desk tasks:", e);
    return Response.json({ error: "Couldn't load your jobs." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const blocked = crossSite(request);
  if (blocked) return blocked;
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await dismissTask(auth.user.id, id);
  return Response.json({ ok: true });
}
