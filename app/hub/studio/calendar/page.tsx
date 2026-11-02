import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { CalendarPage } from "./calendar";

export const metadata: Metadata = { title: "Calendar" };

/* Your Buffer schedule in Creator Desk: what's going out, the gaps, how sent posts did, and scheduling new ones. */
export default async function Calendar() {
  if (!(await studioUser("calendar"))) notFound();
  return <CalendarPage />;
}
