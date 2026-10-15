import { z } from "zod";
import { saveDeviceFiles, touchDevice } from "../../../../hub/_lib/edits/data";
import { helperApi } from "../../../../hub/_lib/edits/helper-auth";

/* The helper reports what it can see: versions, whether CapCut is open, and the latest clips. */

const Body = z.object({
  info: z.record(z.string(), z.unknown()).default({}),
  files: z
    .array(
      z.object({
        path: z.string().max(1_000),
        name: z.string().max(300),
        folder: z.string().max(300).default(""),
        modifiedAt: z.string().max(40).nullable().default(null),
        duration: z.number().nullable().default(null),
        thumb: z.string().max(60_000).nullable().default(null),
      }),
    )
    .max(80)
    .optional(),
});

export async function POST(request: Request) {
  return helperApi(request, async (auth) => {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return { ok: false };
    await touchDevice(auth.deviceId, parsed.data.info);
    if (parsed.data.files) await saveDeviceFiles(auth.deviceId, parsed.data.files);
  });
}
