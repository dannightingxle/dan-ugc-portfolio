import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { NewJob } from "./new-job";

export const metadata: Metadata = { title: "New tech job from its brief" };

/* Paste everything you have on a new tech job: it's added and set up in one go. */
export default async function NewJobPage() {
  if (!(await studioUser())) notFound();
  return <NewJob />;
}
