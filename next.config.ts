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
    if (!appHost) return [];
    return [appHost, `www.${appHost}`].map((host) => ({
      source: "/:path((?!hub|api|_next).*)",
      has: [{ type: "host" as const, value: host }],
      destination: "/hub",
      permanent: false,
    }));
  },
};

export default nextConfig;
