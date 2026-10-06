import type { Metadata } from "next";
import { Fraunces, Geist, Inter, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { AccountProvider } from "./account-provider";
import { accountsEnabled } from "./_lib/supabase/config";
import { currentUser } from "./_lib/supabase/server";
import { HubNav } from "./nav";
import { DEFAULT_THEME } from "./themes";
import "./hub.css";

/* Fonts used by the themes in hub.css. Browsers only download the active one. */
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const fontVars = [geist, jakarta, inter, fraunces, manrope].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Creator Hub",
  description: "Track your UGC ads, projects and scripts.",
  robots: { index: false, follow: false },
};

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div id="hub" data-theme={DEFAULT_THEME} className={`hub ${fontVars} min-h-screen`}>
      <AccountProvider enabled={accountsEnabled} user={user}>
        <HubNav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
      </AccountProvider>
    </div>
  );
}
