import { touchDevice, workFor } from "../../../../hub/_lib/edits/data";
import { helperApi } from "../../../../hub/_lib/edits/helper-auth";

/* The helper asks every couple of seconds: anything to edit, pick, pass on or stop? */

export async function GET(request: Request) {
  return helperApi(request, async (auth) => {
    await touchDevice(auth.deviceId);
    // Newer helpers list the edits they're running, so ones a restart dropped can be let go.
    const running = new URL(request.url).searchParams.get("running");
    return workFor(auth, running === null ? null : running.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)));
  });
}
