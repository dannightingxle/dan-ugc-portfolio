"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEMES } from "./themes";

/* Style picker for trying the hub themes in hub.css. The choice is remembered
   in this browser. Once a theme is chosen this can go, leaving DEFAULT_THEME. */


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
    <label className="flex items-center gap-2 text-xs text-text-dim">
      Style
      <select
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
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
