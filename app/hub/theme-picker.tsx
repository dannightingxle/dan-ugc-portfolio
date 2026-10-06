"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEMES } from "./themes";

/* Temporary style picker for comparing the themes in hub.css. Remembered in
   this browser; ?theme=<id> in the URL also works. Remove once one is chosen. */

function apply(id: string) {
  document.getElementById("hub")?.setAttribute("data-theme", id);
}

export function ThemePicker() {
  const [theme, setTheme] = useState<string>(DEFAULT_THEME);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = new URLSearchParams(location.search).get("theme") ?? localStorage.getItem("hub:theme");
    } catch {}
    if (saved && THEMES.some((t) => t.id === saved)) {
      apply(saved);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from storage once on mount
      setTheme(saved);
    }
  }, []);

  return (
    <select
      aria-label="Style"
      value={theme}
      onChange={(e) => {
        setTheme(e.target.value);
        apply(e.target.value);
        try {
          localStorage.setItem("hub:theme", e.target.value);
        } catch {}
      }}
      className="rounded-lg border border-border bg-bg-card px-2 py-1 text-sm text-text outline-none"
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          Style: {t.label}
        </option>
      ))}
    </select>
  );
}
