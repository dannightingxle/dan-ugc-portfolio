"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/* Creator Desk's own pop-ups, in place of the browser's: hover tooltips,
   "are you sure?" dialogs and the "please fill in this field" bubbles. */

// ---------------------------------------------------------------- tooltip

/** A hint shown on hover or keyboard focus (works on disabled buttons too, since it hangs off a wrapper). */
export function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  className = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  /** "end" lines the hint up with the right edge, for things at the edge of the screen. */
  align?: "center" | "end";
  className?: string;
}) {
  const id = useId();
  if (!label) return <>{children}</>;
  return (
    <span
      className={`group/tip relative inline-flex max-w-full ${className}`}
      aria-describedby={id}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-50 hidden w-max max-w-[min(18rem,80vw)] break-words ${align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"} rounded-lg bg-text px-2.5 py-1.5 text-xs font-medium leading-snug text-bg shadow-lg group-focus-within/tip:block group-hover/tip:block ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- confirm dialog

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type Ask = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** `const confirm = useConfirm(); if (!(await confirm({ title: "Delete this?" }))) return;` */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  // Outside the provider (shouldn't happen), fall back to the browser's.
  return (
    ask ??
    (async (o) =>
      window.confirm([o.title, o.message].filter(Boolean).join("\n\n")))
  );
}

export function Popups({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const ask = useCallback<Ask>(
    (o) => new Promise((resolve) => setOpen({ ...o, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    open?.resolve(ok);
    setOpen(null);
  };

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        onCancel={(e) => {
          e.preventDefault(); // Escape
          close(false);
        }}
        onClick={(e) => e.target === e.currentTarget && close(false)} // the backdrop
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-card p-0 text-text shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
      >
        {open && (
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <h2 id="confirm-title" className="text-lg font-semibold">
                {open.title}
              </h2>
              {open.message && (
                <p className="text-sm text-text-muted">{open.message}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:border-text-dim"
              >
                {open.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={`rounded-xl px-4 py-2 text-sm font-medium text-on-accent ${open.danger ? "bg-[#dc2626] hover:bg-[#b91c1c]" : "bg-accent hover:bg-accent-hover"}`}
              >
                {open.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        )}
      </dialog>
      <FieldWarnings />
    </ConfirmContext.Provider>
  );
}

// ---------------------------------------------------------------- form warnings

/** Replaces the browser's "Please fill in this field" bubble with one in the app's style, under the field. */
function FieldWarnings() {
  const [warning, setWarning] = useState<{
    text: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    let first = true;
    const onInvalid = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (!(el instanceof HTMLElement) || !el.closest(".hub")) return;
      e.preventDefault();
      // A form with several empty fields fires once per field: point at the first.
      if (!first) return;
      first = false;
      setTimeout(() => (first = true), 0);
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
      const r = el.getBoundingClientRect();
      setWarning({
        text: el.validationMessage,
        top: r.bottom + 6,
        left: Math.max(8, r.left),
        width: r.width,
      });
    };
    const clear = () => setWarning(null);
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", clear, true);
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    return () => {
      window.removeEventListener("scroll", clear, true);
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 5000);
    return () => clearTimeout(t);
  }, [warning]);

  if (!warning) return null;
  return (
    <div
      role="alert"
      className="fixed z-50 max-w-[min(20rem,90vw)] rounded-lg bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-lg"
      style={{
        top: warning.top,
        left: warning.left,
        minWidth: Math.min(warning.width, 160),
      }}
    >
      {warning.text}
    </div>
  );
}
