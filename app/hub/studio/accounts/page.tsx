import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioUser } from "../../_lib/studio/data";
import { Accounts } from "./accounts";

export const metadata: Metadata = { title: "Accounts" };

/* Followers, views and recent posts for your own accounts and each tech UGC job's. */
export default async function AccountsPage() {
  if (!(await studioUser("accounts"))) notFound();
  return <Accounts />;
}
