/* Features that roll out in stages: owners first, then the beta group (e.g.
   the mentorship group), then everyone. Who sees each one is set on
   /hub/admin. New features start with owners. Safe to import anywhere. */

export const FEATURES = [
  { key: "studio", name: "Studio", about: "Claude workspace per job: set-up from a brief, weekly shoot sheets, Friday review, account checklist." },
  { key: "followups", name: "Tech jobs & follow-ups", about: "Tech UGC stages, pay model, 'waiting on' and chase dates, and the Waiting on list on the home page." },
  { key: "brand", name: "Personal brand plan", about: "Ideas inbox from the creators you track and content idea accounts (with the sounds they're using), a weekly content plan from your own top posts and those ideas, and trial reels: 5 versions of a reel with the winner fed back (stats via Apify)." },
  { key: "accounts", name: "Accounts", about: "Followers, views and recent posts for your own accounts and each tech UGC job's account, refreshed daily (stats via Apify)." },
  { key: "edits", name: "Edits on your Mac", about: "An edit card per video, edited in CapCut on your own Mac by the Creator Desk Helper and your Claude Code." },
  { key: "todos", name: "To-dos", about: "Your to-dos at the top of the home page: one-offs, repeating ones, and submitted work that comes back to check in on after 3 days without approval." },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const AUDIENCES = ["owner", "beta", "everyone"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = { owner: "Just me", beta: "Beta group", everyone: "Everyone" };
