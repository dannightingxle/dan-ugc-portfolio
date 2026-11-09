import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { studioUser } from "../_lib/studio/data";
import { DwightPage } from "./full";

export const metadata: Metadata = { title: "Dwight" };

/* Dwight on a page of its own: the same conversations as the corner panel, with room to read. */
export default async function Page() {
  if (!(await studioUser("dwight"))) notFound();
  return (
    <Suspense>
      <DwightPage />
    </Suspense>
  );
}
