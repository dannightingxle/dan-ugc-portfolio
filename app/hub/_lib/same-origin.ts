/** Rejects state-changing requests sent from another website (cross-site
    request forgery). Browsers always send Origin on these requests. */
export function crossSite(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // not a browser - CSRF needs a browser
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (new URL(origin).host === host) return null;
  } catch {}
  return Response.json({ error: "Request blocked." }, { status: 403 });
}
