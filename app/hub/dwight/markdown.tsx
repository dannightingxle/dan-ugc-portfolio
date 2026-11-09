"use client";

import Link from "next/link";
import { Fragment } from "react";
import { isHubLink } from "../_lib/dwight/types";

/* Just enough Markdown for Dwight's replies: paragraphs, lists, small
   tables, **bold**, `code` and links (Creator Desk links open in place,
   anything else in a new tab). Rendered as React, never as raw HTML. */

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(p))
          return (
            <code key={i} className="rounded bg-text/5 px-1 text-[0.9em]">
              {p.slice(1, -1)}
            </code>
          );
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
        if (link) {
          const [, label, href] = link;
          if (isHubLink(href))
            return (
              <Link key={i} href={href} className="font-medium text-accent underline">
                {label}
              </Link>
            );
          if (/^https?:\/\//.test(href))
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
                {label}
              </a>
            );
          return <Fragment key={i}>{label}</Fragment>;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      const [head, ...rest] = body;
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr>
                {cells(head ?? "").map((c, j) => (
                  <th key={j} className="border-b border-border px-1.5 py-1 font-semibold">
                    <Inline text={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((r, k) => (
                <tr key={k} className="border-b border-border/60 align-top">
                  {cells(r).map((c, j) => (
                    <td key={j} className="px-1.5 py-1">
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*[-*•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i])) items.push(lines[i++].replace(ordered ? numbered : bullet, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length} className={`${ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
          {items.map((it, k) => (
            <li key={k}>
              <Inline text={it} />
            </li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s)/.test(lines[i])) para.push(lines[i++].replace(/^#+\s*/, ""));
    blocks.push(
      <p key={blocks.length}>
        {para.map((l, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            <Inline text={l} />
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="space-y-2">{blocks}</div>;
}
