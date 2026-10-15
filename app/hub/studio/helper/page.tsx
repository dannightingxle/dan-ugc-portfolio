import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { Helper } from "./helper";

export const metadata: Metadata = { title: "Mac helper" };

/* Connect a Mac so edit cards can be edited there with Claude Code and CapCut. */
export default async function HelperPage() {
  if (!(await studioUser("edits"))) notFound();
  return <Helper />;
}
