/* Features that roll out in stages: owners first, then the beta group (e.g.
   the mentorship group), then everyone. Who sees each one is set on
   /hub/admin. New features start with owners. Safe to import anywhere. */

export const FEATURES = [
  { key: "studio", name: "Studio", about: "Claude workspace per job: set-up from a brief, weekly shoot sheets, Friday review, account checklist." },
  { key: "followups", name: "Tech jobs & follow-ups", about: "Tech UGC stages, pay model, 'waiting on' and chase dates, and the Waiting on list on the home page." },
  { key: "brand", name: "Personal brand plan", about: "Weekly content plan from your own top posts and the creators you track (stats via Apify)." },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const AUDIENCES = ["owner", "beta", "everyone"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = { owner: "Just me", beta: "Beta group", everyone: "Everyone" };
