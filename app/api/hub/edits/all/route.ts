import { listAllEdits } from "../../../../hub/_lib/edits/data";
import { editsApi } from "../../../../hub/_lib/edits/request";

/* Every job's edits in one list (going, waiting on you, to do, or done in the last two weeks), for the Edits page. */

export async function GET(request: Request) {
  return editsApi(request, null, async ({ user }) => ({ edits: await listAllEdits(user.id) }));
}
