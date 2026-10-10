import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../../_lib/studio/data";
import { Studio } from "./studio";

export const metadata: Metadata = { title: "Studio" };

/* A job's Studio (owners only for now). */
export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await studioUser())) notFound();
  const { id } = await params;
  return <Studio projectId={id} />;
}
