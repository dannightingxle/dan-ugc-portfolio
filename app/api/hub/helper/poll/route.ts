import { touchDevice, workFor } from "../../../../hub/_lib/edits/data";
import { helperApi } from "../../../../hub/_lib/edits/helper-auth";

/* The helper asks every couple of seconds: anything to edit, pick, pass on or stop? */

export async function GET(request: Request) {
  return helperApi(request, async (auth) => {
    await touchDevice(auth.deviceId);
    return workFor(auth);
  });
}
