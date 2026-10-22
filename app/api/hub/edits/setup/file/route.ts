import { NotFound, editsApi } from "../../../../../hub/_lib/edits/request";
import { setupContent, validSha } from "../../../../../hub/_lib/edits/setup";

/* One file of your editing setup, word for word: GET ?sha= gives its text (or says it's a binary file). */

export async function GET(request: Request) {
  const sha = new URL(request.url).searchParams.get("sha");
  return editsApi(request, null, async ({ user }) => {
    const content = validSha(sha) ? await setupContent(user.id, sha) : null;
    if (!content) throw new NotFound("That file isn't here any more - reload the page.");
    return content;
  });
}
