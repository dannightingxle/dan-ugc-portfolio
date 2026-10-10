import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AccessGate, AccountProvider } from "./account-provider";
import { accountsEnabled } from "./_lib/supabase/config";
import { currentUser } from "./_lib/supabase/server";
import { HubNav } from "./nav";
import { BRAND } from "./_lib/brand";
import { billingFor } from "./_lib/billing/stripe";
import { OPEN_ACCESS } from "./_lib/billing/types";
import { featuresFor } from "./_lib/features";
import { Analytics } from "@vercel/analytics/next";
import "./hub.css";

/* Font used by hub.css. */
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  robots: { index: false, follow: false },
};

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const [billing, features] = user ? await Promise.all([billingFor(user), featuresFor(user)]) : [OPEN_ACCESS, []];
  return (
    <div className={`hub ${jakarta.variable} min-h-screen`}>
      <AccountProvider enabled={accountsEnabled} user={user} billing={billing} features={features}>
        <HubNav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-24">
          <AccessGate>{children}</AccessGate>
        </main>
      </AccountProvider>
      {/* Page views only, no cookies. Switch on under Analytics in the Vercel project. */}
      <Analytics />
    </div>
  );
}
