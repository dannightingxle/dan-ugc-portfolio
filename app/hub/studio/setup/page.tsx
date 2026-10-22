import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { SetupPage } from "./setup";

export const metadata: Metadata = { title: "Editing setup" };

/* The files Claude Code edits your videos with, word for word, the same on all your Macs. */
export default async function EditingSetupPage() {
  if (!(await studioUser("edits"))) notFound();
  return <SetupPage />;
}
