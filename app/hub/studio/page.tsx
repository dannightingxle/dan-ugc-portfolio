import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { featuresFor } from "../_lib/features";
import { currentUser } from "../_lib/supabase/server";
import { studioUser } from "../_lib/studio/data";
import { StudioHome } from "./studio-home";

export const metadata: Metadata = { title: "Studio" };

/* Studio home: the personal brand plan and every tech UGC job's workspace. */
export default async function StudioPage() {
  const [jobs, brand] = await Promise.all([studioUser("studio"), studioUser("brand")]);
  if (!jobs && !brand) notFound();
  const features = await featuresFor(await currentUser());
  return <StudioHome jobs={Boolean(jobs) && features.includes("studio")} brand={Boolean(brand)} />;
}
