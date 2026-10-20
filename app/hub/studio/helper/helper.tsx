"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HELPER_FOR_LIBRARY, helperOlderThan, type Device } from "../../_lib/edits/types";
import { call, CopyButton } from "../../projects/[id]/studio/studio";
import { useConfirm } from "../../_lib/popups";

/* The Mac helper: what it does, what it needs, connecting a Mac with a one-time
   code, and the Macs already connected. */

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

const OSXPHOTOS_INSTALL = "curl -LsSf https://astral.sh/uv/install.sh | sh && ~/.local/bin/uv tool install --python 3.13 osxphotos";

export function Helper() {
  // Only shown once the Macs have loaded, so after the page is up.
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const confirm = useConfirm();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState<{ code: string; expires: string; origin: string; at: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  // While a code is showing, look for the Mac coming online every few seconds.
  useEffect(() => {
    const tick = () =>
      call<{ devices: Device[] }>("/api/hub/edits/devices", "GET").then(
        (r) => {
          setDevices(r.devices);
          if (code) setConnected(r.devices.some((d) => d.online && Date.parse(d.lastSeen ?? "0") > code.at - 5_000));
        },
        (e: Error) => setError(e.message),
      );
    void tick();
    const t = setInterval(tick, code ? 3000 : 15000);
    return () => clearInterval(t);
  }, [code]);

  async function newCode() {
    setError("");
    try {
      const r = await call<{ code: string; expires: string }>("/api/hub/edits/devices", "POST");
      setConnected(false);
      setCode({ ...r, origin: window.location.origin, at: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function disconnect(d: Device) {
    if (!(await confirm({ title: `Disconnect ${d.name}?`, message: "Its helper will stop getting work until you connect it again.", confirmLabel: "Disconnect", danger: true }))) return;
    await call(`/api/hub/edits/devices?id=${d.id}`, "DELETE").catch((e: Error) => setError(e.message));
    setDevices((list) => list?.filter((x) => x.id !== d.id) ?? null);
  }

  const command = code ? `curl -fsSL ${code.origin}/helper/install.sh | bash -s -- ${code.code}` : "";
  const update = `curl -fsSL ${origin}/helper/creator-desk-helper.mjs -o ~/.creator-desk/creator-desk-helper.mjs`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/hub/studio" className="text-sm text-text-muted hover:text-accent">
          ← Studio
        </Link>
        <h1 className="mt-2 font-serif text-4xl italic sm:text-5xl">Mac helper</h1>
        <p className="mt-2 text-text-muted">
          Edits your videos on your own Mac. When you press <strong>Edit in CapCut</strong> on an edit card, the helper hands the video card and your clips to your Claude Code
          (your login, your skills, your CapCut tool) and sends the conversation back to the card. Your videos never leave your Mac.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-bg-card p-5">
        <h2 className="font-serif text-2xl">Your Macs</h2>
        {devices === null ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-text-muted">None connected yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <span className={`h-2 w-2 rounded-full ${d.online ? "bg-good" : "bg-text-dim"}`} />
                    {d.name}
                  </p>
                  <p className="text-xs text-text-dim">
                    {d.online ? "Connected" : `Offline - last seen ${ago(d.lastSeen)}`}
                    {d.info.capcut && ` · CapCut ${d.info.capcut}`}
                    {d.info.claude && ` · ${d.info.claude}`}
                    {d.info.helper && ` · helper ${d.info.helper}`}
                  </p>
                  {d.online && d.info.capcutRunning && <p className="text-xs text-warn">CapCut is open. Close it before an edit saves, or Claude will wait for you.</p>}
                  {d.info.folders?.length ? <p className="text-xs text-text-dim">Looks for clips in {d.info.folders.map((f) => f.replace(/^\/Users\/[^/]+/, "~")).join(", ")}</p> : null}
                  {d.info.libraries?.length ? <p className="text-xs text-text-dim">Finds B-roll in Apple Photos and {d.info.libraries.join(", ")}</p> : null}
                  {!helperOlderThan(d.info.helper, "0.2.1") && d.info.osxphotos === false && (
                    <div className="mt-2 space-y-1 rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-muted">
                      <p>
                        <strong className="text-text">Photos in iCloud?</strong> If &ldquo;Optimise Mac Storage&rdquo; is on, Photos can&apos;t hand over clips that aren&apos;t downloaded.
                        Install osxphotos (free) and the helper downloads them itself. In Terminal:
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 break-all">{OSXPHOTOS_INSTALL}</code>
                        <CopyButton text={OSXPHOTOS_INSTALL} label="Copy" />
                      </div>
                    </div>
                  )}
                  {helperOlderThan(d.info.helper, HELPER_FOR_LIBRARY) && (
                    <div className="mt-2 space-y-1 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                      <p>
                        This helper can&apos;t find B-roll or make trial versions yet. Update it once (it keeps itself up to date after this): in Terminal, paste this, press Enter, then
                        start the helper again.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 break-all">{update}</code>
                        <CopyButton text={update} label="Copy" />
                      </div>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => disconnect(d)} className="text-sm text-text-dim hover:text-accent">
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-bg-card p-5">
        <h2 className="font-serif text-2xl">Connect a Mac</h2>
        <div className="space-y-1 text-sm text-text-muted">
          <p className="font-medium text-text">You&apos;ll need, on that Mac:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Claude Code</strong>, signed in, with the{" "}
              <a href="https://github.com/JmsLdrn/capcut-mcp" target="_blank" rel="noreferrer" className="text-accent underline">
                CapCut MCP
              </a>{" "}
              added (the tool that lets Claude edit CapCut drafts).
            </li>
            <li>
              <strong>CapCut desktop</strong>, and <strong>Node</strong> (Claude Code already needs it).
            </li>
            <li>
              <strong>ffmpeg</strong> (optional) so clips show their length and a thumbnail.
            </li>
          </ul>
        </div>
        {!code ? (
          <button type="button" onClick={newCode} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover">
            Get a connect code
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              1. On the Mac, open <strong>Terminal</strong> (Cmd+Space, type Terminal). 2. Paste this and press Enter. The code works once, for 15 minutes.
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg-elevated p-3">
              <code className="min-w-0 flex-1 break-all text-xs">{command}</code>
              <CopyButton text={command} label="Copy" />
            </div>
            <p className={`text-sm ${connected ? "font-medium text-good" : "text-text-muted"}`}>
              {connected ? "Connected. Leave that Terminal window open while you edit." : "Waiting for your Mac…"}
            </p>
          </div>
        )}
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="space-y-1 border-t border-border pt-3 text-sm text-text-muted">
          <p className="font-medium text-text">After that</p>
          <p>
            Start it again any time: <code className="text-xs">node ~/.creator-desk/creator-desk-helper.mjs</code>
          </p>
          <p>
            Or have it start by itself when you log in: <code className="text-xs">node ~/.creator-desk/creator-desk-helper.mjs autostart on</code>
          </p>
          <p>Claude Code runs without a window, so the helper lets it use your CapCut tool, run commands and write files in your editing folder without asking each time.</p>
          <p>
            For B-roll from <strong>Apple Photos</strong>, the first time it looks your Mac asks to let Terminal (or Node) control Photos: say OK. External drives plugged in are
            looked through by themselves.
          </p>
        </div>
      </section>
    </div>
  );
}
