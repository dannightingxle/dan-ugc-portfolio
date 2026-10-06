import { newProject, type Project } from "./store";

/* A fully filled-in example job, so a new account isn't an empty board and
   every section of a project shows what it's for. Dates are relative to today. */

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const id = () => crypto.randomUUID();

export function exampleProject(): Project {
  return newProject({
    example: true,
    brand: "Northmoor Nutrition",
    title: "3 x UGC video ads - new chocolate protein shake",
    stage: "Filming",
    filmBy: inDays(3),
    due: inDays(10),
    goLive: inDays(21),
    fee: 950,
    paymentStatus: "Not invoiced",
    paymentTermsDays: 30,
    paymentNotes: "50% upfront (paid), 50% on delivery. Usage beyond 3 months is £150/month extra. Bank transfer.",
    contact: {
      name: "Sarah Jones",
      role: "Creator partnerships",
      company: "Northmoor Nutrition",
      email: "sarah@northmoor.example",
      phone: "07700 900123",
      handle: "@northmoornutrition",
    },
    deliverables: [
      { id: id(), item: "Video ad (hook, demo, CTA)", qty: 3, format: "9:16", length: "30s", done: false },
      { id: id(), item: "Hook variations", qty: 3, format: "9:16", length: "3s", done: false },
      { id: id(), item: "Raw footage", qty: 1, format: "Raw", length: "", done: false },
      { id: id(), item: "Product photos", qty: 5, format: "Photo", length: "", done: true },
    ],
    product: "Chocolate whey protein shake, 1kg tub",
    shipping: "Received",
    keyMessages:
      "25g protein per scoop, only 110 calories.\nActually tastes like a chocolate milkshake - no chalky aftertaste.\nMixes in seconds with a shaker or blender.\nLaunch offer: 20% off with code SARAH20.",
    dos: "Show the shake being made in the first 3 seconds.\nFilm in a real kitchen or gym, natural light.\nTalk to camera like you're telling a friend.",
    donts: "No competitor brands in shot.\nDon't call it a meal replacement or make weight-loss claims.\nNo music with copyright.",
    usageRights: "Paid social, 3 months, UK & IE",
    exclusivity: "30 days, sports nutrition",
    revisions: "2 rounds included",
    links: [
      { id: id(), label: "Notion brief", url: "https://www.notion.so/northmoor/protein-shake-ugc-brief" },
      { id: id(), label: "Google Drive", url: "https://drive.google.com/drive/folders/northmoor-deliverables" },
    ],
    notes:
      "Found via TrendTrack - they're scaling partnership ads hard this month.\nSarah prefers WhatsApp for quick questions. Brand loved the dad-at-home angle on the first call.\n\nThis is an example job - edit it or delete it.",
    script:
      "HOOK: \"I didn't think a protein shake could taste like this…\"\n\nShot of scooping and shaking. Take a sip, genuine reaction.\n\n\"25 grams of protein, 110 calories, and it actually tastes like a chocolate milkshake. The kids keep nicking it.\"\n\nCTA: \"Link's below - use SARAH20 for 20% off.\"",
  });
}
