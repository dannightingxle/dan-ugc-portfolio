import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans, Fraunces, Geist, Instrument_Sans, Instrument_Serif, Manrope, Space_Grotesk } from "next/font/google";
import { HubNav } from "./nav";
import { DEFAULT_THEME } from "./themes";
import "./hub.css";

/* Fonts for the hub themes in hub.css. Only the active theme's fonts are
   actually downloaded by the browser. */
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

const fontVars = [instrument, geist, bricolage, instrumentSans, fraunces, manrope, spaceGrotesk, dmSans].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Creator Hub",
  description: "Track your UGC ads, projects and scripts.",
  robots: { index: false, follow: false },
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="hub" data-theme={DEFAULT_THEME} className={`hub ${fontVars} min-h-screen`}>
      <HubNav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
