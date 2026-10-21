import { crossSite } from "../../../../hub/_lib/same-origin";
import { adminClient } from "../../../../hub/_lib/supabase/admin";
import { BRAND_ID, studioApiUser } from "../../../../hub/_lib/studio/data";
import { dismissTask, listTasks } from "../../../../hub/_lib/studio/tasks";
import { canUse } from "../../../../hub/_lib/features";

/* Studio's background jobs: GET the running and recently finished ones, and
   the Mac edits that are going or waiting on you (each with its job's brand
   name); DELETE ?id= to clear a finished Studio job. */

// Mac edits worth showing: going, waiting on you or ready to check (changed in the last two days).
const EDIT_STATUSES = ["queued", "editing", "needs_you", "ready", "failed"];

export async function GET() {
  const auth = await studioApiUser();
  if (!auth.ok) return auth.response;
  try {
    const db = adminClient();
    const [tasks, edits] = await Promise.all([
      listTasks(auth.user.id),
      (await canUse(auth.user, "edits"))
        ? db
            .from("hub_edits")
            .select("id, project_id, title, video_code, status, updated_at")
            .eq("user_id", auth.user.id)
            .in("status", EDIT_STATUSES)
            .gt("updated_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
            .order("updated_at", { ascending: false })
            .limit(30)
            .then((r) => r.data ?? [])
        : [],
    ]);
    const ids = [...new Set([...tasks.map((t) => t.projectId), ...edits.map((e) => e.project_id as string)])];
    const { data } = ids.length ? await db.from("hub_projects").select("id, data").eq("user_id", auth.user.id).in("id", ids) : { data: [] };
    const brands = new Map((data ?? []).map((p) => [p.id as string, String((p.data as { brand?: string })?.brand || "Job")]));
    brands.set(BRAND_ID, "Personal brand");
    return Response.json({
      tasks: tasks.map((t) => ({ ...t, brand: brands.get(t.projectId) ?? "Job" })),
      edits: edits.map((e) => ({
        id: e.id,
        projectId: e.project_id,
        brand: brands.get(e.project_id) ?? "Job",
        title: e.title,
        videoCode: e.video_code,
        status: e.status,
        updatedAt: e.updated_at,
      })),
    });
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
