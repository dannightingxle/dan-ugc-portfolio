import type { Metadata } from "next";
import Link from "next/link";
import { studioUser } from "../_lib/studio/data";
import { OWN_SCRIPTS } from "../_lib/scripts/types";
import { ScriptsPanel } from "./scripts-panel";

export const metadata: Metadata = { title: "Scripts" };

/* Scripts that aren't for a job (your own page, an application): write one
   from a brief here. A job's scripts are on the job's page. Until Scripts is
   switched on for someone, this is the "coming soon" page. */
export default async function ScriptsPage() {
  if (!(await studioUser("scripts"))) return <ScriptsComingSoon />;
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="font-serif text-4xl">Scripts</h1>
        <p className="text-text-muted">
          Drop in a brief and get a script pack: 3 hooks, the script with visuals and timings, a shot list by location and an edit map. Scripts for a brand deal
          live on{" "}
          <Link href="/hub/projects" className="text-accent hover:underline">
            the job
          </Link>
          .
        </p>
      </div>
      <ScriptsPanel scope={OWN_SCRIPTS} />
    </div>
  );
}

const PLANNED = [
  {
    title: "Script builder",
    text: "Hook, problem, product, proof and call to action - with prompts for each beat and a read-aloud timer.",
  },
  {
    title: "Hook bank",
    text: "Save hooks that worked, pull the transcripts of your best-performing ads, and remix them for new briefs.",
  },
  {
    title: "Shot lists",
    text: "Turn a script into a numbered shot list with framing, B-roll and props, ready for filming day.",
  },
  {
    title: "Built from the brief",
    text: "Start a script straight from a project, with the key messages, do's and don'ts already in view.",
  },
];

function ScriptsComingSoon() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <div className="space-y-3">
        <span className="inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-medium uppercase tracking-widest text-accent">Coming soon</span>
        <h1 className="font-serif text-4xl italic sm:text-5xl">Scripts &amp; shot lists</h1>
        <p className="text-lg text-text-muted">
          A place to write scripts, build shot lists and keep the hooks that work. For now, each project has a simple script box you can jot ideas into.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLANNED.map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-bg-card p-5">
            <h2 className="font-serif text-xl">{f.title}</h2>
            <p className="mt-2 text-sm text-text-muted">{f.text}</p>
          </div>
        ))}
      </div>
      <Link href="/hub/projects" className="inline-block rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
        Go to projects
      </Link>
    </div>
  );
}
