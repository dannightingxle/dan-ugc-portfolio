import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { HubNav } from "./nav";
import "./hub.css";

/* Fonts used by hub.css. */
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Creator Hub",
  description: "Track your UGC ads, projects and scripts.",
  robots: { index: false, follow: false },
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`hub ${fraunces.variable} ${manrope.variable} min-h-screen`}>
      <HubNav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
