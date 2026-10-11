import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { BrandStudio } from "./brand";

export const metadata: Metadata = { title: "Personal brand" };

/* The personal brand plan (a staged feature). */
export default async function BrandPage() {
  if (!(await studioUser("brand"))) notFound();
  return <BrandStudio />;
}
