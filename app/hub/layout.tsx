import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AccountProvider } from "./account-provider";
import { accountsEnabled } from "./_lib/supabase/config";
import { currentUser } from "./_lib/supabase/server";
import { HubNav } from "./nav";
import "./hub.css";

/* Font used by hub.css. */
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Creator Hub",
  description: "Track your UGC ads, projects and scripts.",
  robots: { index: false, follow: false },
};

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className={`hub ${jakarta.variable} min-h-screen`}>
      <AccountProvider enabled={accountsEnabled} user={user}>
        <HubNav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
      </AccountProvider>
    </div>
  );
}
