import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { NotesPage } from "./notes";

export const metadata: Metadata = { title: "Editing notes" };

/* How you want your videos edited: notes every edit follows, and a chat to change them. */
export default async function EditingNotesPage() {
  if (!(await studioUser("edits"))) notFound();
  return <NotesPage />;
}
