/* Dwight: the helper in the corner of every Creator Desk page. You ask in
   your own words; it looks things up, makes changes (each one listed, with
   Undo), works things out across your jobs and Buffer, and takes you to the
   right page. Each creator can rename theirs. Safe to import anywhere. */

export const DEFAULT_NAME = "Dwight";

/** A button under a reply: a page to go to, or something to start there (which costs Claude credits, so it's your tap). */
export type DwightLink = { label: string; href: string };

export type DwightMessage = {
  id: string;
  role: "you" | "dwight";
  text: string;
  at: string;
  /** While it works: what it's doing ("Looking at your Buffer schedule"). */
  steps?: string[];
  status?: "working" | "done" | "failed";
  /** What it changed, in words. */
  changes?: string[];
  links?: DwightLink[];
  /** The latest change can be undone. */
  canUndo?: boolean;
  undone?: boolean;
  /** The page you were on when you asked. */
  page?: string;
  /** What the page should reload once it's done: jobs changed or added, and whether to-dos changed. */
  touched?: { jobs: string[]; todos: boolean };
};

export type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: DwightMessage[] };
export type ConversationSummary = Pick<Conversation, "id" | "title" | "updatedAt">;

/** The page you're on, so "this job" means something. */
export type PageContext = { path: string; title: string };

/** Only links inside Creator Desk become buttons. */
export const isHubLink = (href: string) => /^\/hub(\/[\w\-/]*)?(\?[\w\-=&%.]*)?(#[\w-]*)?$/.test(href);
