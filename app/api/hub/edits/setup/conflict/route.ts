import { z } from "zod";
import { editsApi } from "../../../../../hub/_lib/edits/request";
import { chooseVersion, combineVersions } from "../../../../../hub/_lib/edits/setup";
import { MAX_SETUP_PATH } from "../../../../../hub/_lib/edits/setup-types";

/* A file that's different on your Macs: POST { path, keep: sha } keeps one
   version, or { path, combine: true } has Claude combine the two into one that
   keeps everything from both. Either way every Mac gets it at the next sync. */

// Combining two long files can take Claude a minute or two.
export const maxDuration = 300;

const Body = z.union([
  z.object({ path: z.string().min(1).max(MAX_SETUP_PATH), keep: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.object({ path: z.string().min(1).max(MAX_SETUP_PATH), combine: z.literal(true) }),
]);

export async function POST(request: Request) {
  return editsApi(request, Body, async ({ user, body }) => {
    if ("keep" in body) {
      await chooseVersion(user.id, body.path, body.keep);
      return { ok: true };
    }
    return { ok: true, ...(await combineVersions(user.id, body.path)) };
  });
}
