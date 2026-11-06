"use client";

import type { Project } from "../../_lib/store";
import { LENGTHS, type Length, type ScriptRequest } from "../../_lib/scripts/types";
import { TextBox } from "../../_lib/text-box";
import { ScriptsPanel } from "../../scripts/scripts-panel";
import { Field, Section, input } from "../fields";

/* A brand deal's scripts, in place of the old plain Script box. What was
   typed in that box is kept underneath. */

/** What the job already says, for a new script's request. */
export function scriptPrefill(p: Project): Partial<ScriptRequest> {
  const deliverables = p.deliverables
    .filter((d) => d.item.trim())
    .map((d) => `${d.qty} x ${d.item}${d.format ? ` (${d.format}${d.length ? `, ${d.length}` : ""})` : d.length ? ` (${d.length})` : ""}`);
  const brief = [
    deliverables.length ? `Deliverables: ${deliverables.join("; ")}` : "",
    p.dos.trim() ? `Do's:\n${p.dos.trim()}` : "",
    p.usageRights.trim() ? `Usage: ${p.usageRights.trim()}` : "",
    ...p.links.filter((l) => l.url.trim()).map((l) => `${l.label || "Link"}: ${l.url}`),
  ]
    .filter(Boolean)
    .join("\n\n");
  // The length from a deliverable that says 15, 30 or 60 seconds.
  const said = p.deliverables.map((d) => Number(/(\d+)\s*s/i.exec(d.length)?.[1])).find((n) => (LENGTHS as readonly number[]).includes(n));
  return {
    brand: p.brand,
    product: p.product,
    brief,
    mustSay: p.keyMessages,
    mustNotSay: p.donts,
    ...(said ? { length: said as Length } : {}),
  };
}

export function JobScripts({ project, set }: { project: Project; set: (k: "script", v: string) => void }) {
  return (
    <div id="scripts" className="scroll-mt-20">
      <Section title="Scripts">
        <ScriptsPanel scope={project.id} prefill={scriptPrefill(project)} />
        {project.script.trim() && (
          <Field label="Your earlier script notes" hint="From before the scripting tool. Kept here until you clear them.">
            <TextBox rows={4} className={input} value={project.script} onValue={(v) => set("script", v)} />
          </Field>
        )}
      </Section>
    </div>
  );
}
