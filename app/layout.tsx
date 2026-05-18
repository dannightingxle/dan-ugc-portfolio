import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dan Nightingale — UGC Creator | Marketing-trained content for dads, families & grown-up brands",
  description:
    "UK-based UGC creator with 10+ years in performance marketing. UGC video that's written, filmed and edited to convert — for supplement, fitness, finance, family and lifestyle brands. Husband-wife duo content available.",
  openGraph: {
    title: "Dan Nightingale — UGC Creator",
    description:
      "Marketing-trained UGC for dads, families and grown-up brands. UK-based. Husband-wife duo available.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col grain">{children}</body>
    </html>
  );
}
