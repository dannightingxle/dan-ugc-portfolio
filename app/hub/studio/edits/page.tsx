import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { AllEdits } from "./all-edits";

export const metadata: Metadata = { title: "Edits" };

/* Every job's edits in one place: what needs you, what's ready to check, what's editing. */
export default async function EditsPage() {
  if (!(await studioUser("edits"))) notFound();
  return <AllEdits />;
}
