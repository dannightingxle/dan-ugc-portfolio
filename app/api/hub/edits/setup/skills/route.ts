import { z } from "zod";
import { editsApi } from "../../../../../hub/_lib/edits/request";
import { setSkillChoice } from "../../../../../hub/_lib/edits/setup";

/* Which skills your Macs carry between them: PATCH { name, choice } with
   "include", "exclude", or null to leave it to your Macs (editing-related ones). */

const Body = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((n) => !n.includes("/") && !n.includes("\\") && n !== "." && n !== "..", "That isn't a skill name."),
  choice: z.enum(["include", "exclude"]).nullable(),
});

export async function PATCH(request: Request) {
  return editsApi(request, Body, async ({ user, body }) => ({ skills: await setSkillChoice(user.id, body.name, body.choice) }));
}
