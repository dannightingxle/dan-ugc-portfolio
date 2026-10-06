import type { Metadata } from "next";
import { HubNav } from "./nav";

export const metadata: Metadata = {
  title: "Creator Hub",
  description: "Track your UGC ads, projects and scripts.",
  robots: { index: false, follow: false },
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <HubNav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
