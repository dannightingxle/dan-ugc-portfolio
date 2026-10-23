import type { NextConfig } from "next";
import path from "path";

/* Creator Desk can have its own domain: point it at this Vercel project and set
   HUB_APP_HOST (e.g. "creatordesk.co.uk") before deploying. Everything on that
   domain then opens Creator Desk instead of the portfolio. */
const appHost = process.env.HUB_APP_HOST;

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Loaded as-is at run time so it can find its own binary.
  serverExternalPackages: ["ffmpeg-static"],
  // Reference videos are turned into frames with ffmpeg (app/hub/_lib/studio/videos.ts):
  // ship its binary with the routes that do it (and the cron that looks for ideas).
  outputFileTracingIncludes: {
    "/api/hub/studio/\\[projectId\\]/week": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/hub/studio/\\[projectId\\]/intake": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/hub/studio/brand/ideas": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/hub/studio/brand/trials": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/hub/cron/weekly": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  // The portfolio's videos are served as static files; no server code needs them (and they'd push
  // functions over Vercel's size limit).
  outputFileTracingExcludes: {
    "/*": ["./public/**/*.mp4", "./public/**/*.mov"],
  },
  async headers() {
    // Creator Desk pages can't be framed by other sites (stops click-jacking
    // tricks on things like "Delete account"), and don't leak full URLs.
    const security = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/hub/:path*", headers: security },
      { source: "/hub", headers: security },
      { source: "/api/hub/:path*", headers: security },
    ];
  },
  async redirects() {
    // A short link to share for the Creator Desk waitlist.
    const waitlist = ["/creatordesk", "/creator-desk"].map((source) => ({ source, destination: "/hub/welcome", permanent: false }));
    if (!appHost) return waitlist;
    return [...waitlist, ...[appHost, `www.${appHost}`].map((host) => ({
      source: "/:path((?!hub|api|_next).*)",
      has: [{ type: "host" as const, value: host }],
      destination: "/hub",
      permanent: false,
    }))];
  },
};

export default nextConfig;
