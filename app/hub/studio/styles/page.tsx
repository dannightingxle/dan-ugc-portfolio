import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { StylesPage } from "./styles";

export const metadata: Metadata = { title: "Edit styles" };

/* Your edit styles: how each kind of video is edited, with key frames that show it, the same on every device. */
export default async function EditStylesPage() {
  if (!(await studioUser("edits"))) notFound();
  return <StylesPage />;
}
