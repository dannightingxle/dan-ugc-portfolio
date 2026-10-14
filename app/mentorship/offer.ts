/* Everything you'd change about the offer lives here: prices, the Stripe
   payment links and the Skool group link. Paste a link in and redeploy - until
   a link is set, its button shows "Opening soon" instead of going anywhere.
   How to make the payment links: MENTORSHIP.md. */

export const OFFER = {
  mentorship: {
    name: "Anyone Can Create Mentorship",
    price: "£497",
    // Stripe payment link
    checkoutUrl: "https://buy.stripe.com/8x200j53l5GZ4tx5fSfQI06",
  },
  course: {
    name: "Anyone Can Create: the course",
    // Shown on /course only. Leave empty to show no price on the page (Stripe still shows it at checkout).
    price: "£147",
    checkoutUrl: "https://buy.stripe.com/dRm3cv1R98TbbVZ37KfQI07",
  },
  // The Skool group, e.g. "https://www.skool.com/your-group"
  skoolUrl: "https://www.skool.com/anyone-can-create-5406/about",
};

/* The course modules, in the same order as the Skool classroom. Shared by the
   mentorship and course pages. */
export const MODULES = [
  {
    title: "Start Here",
    body: "Your roadmap from zero to paid, the apps and AI I use, picking your niche, kit on a budget, and your first 30 days.",
  },
  {
    title: "Content That Converts",
    body: "How brands judge a UGC ad, hooks, scripting, confidence on camera, filming, batching and light editing.",
  },
  {
    title: "Your Portfolio",
    body: "What brands look for, making portfolio pieces with no clients, and building your portfolio site.",
  },
  {
    title: "Tech UGC: Your First Paid Work",
    body: "The quickest route to getting paid. The formats tech companies pay for, a week of videos in three afternoons, and the referral test.",
    tag: "Start here if you're new",
  },
  {
    title: "Winning Jobs",
    body: "The platforms worth your time, a personal brand that brings brands to you, pitching, pricing, usage rights and keeping clients.",
  },
  {
    title: "Tools, AI and Workflow",
    body: "Using AI for briefs, scripts and shot lists, tracking every deal, and handing off to an editor.",
  },
  {
    title: "The Business Side",
    body: "Contracts, deposits, invoicing, tax basics for UK creators, and staying compliant.",
  },
  {
    title: "Mentality, Routine and Health",
    body: "Handling rejection and slow months, and a weekly routine that fits around a job and a family.",
  },
];
