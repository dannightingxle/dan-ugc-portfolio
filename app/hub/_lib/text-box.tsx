"use client";

import { type TextareaHTMLAttributes, useEffect, useRef } from "react";

/* A text box that keeps whatever lands in it - typed, pasted, or dictated
   (Wispr Flow and the like can put text in without the events a page usually
   listens for). The box holds its own text, so a page updating around it never
   wipes it, and it checks itself for new text while you're in it. */

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue" | "onChange"> & { value: string; onValue: (v: string) => void };

export function TextBox({ value, onValue, ...props }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ value, onValue });
  useEffect(() => {
    latest.current = { value, onValue };
  });
  // Changed from outside (cleared after sending, say): show it.
  useEffect(() => {
    if (box.current && box.current.value !== value) box.current.value = value;
  }, [value]);
  const sync = () => {
    const v = box.current?.value ?? "";
    if (v !== latest.current.value) latest.current.onValue(v);
  };
  // Dictation can arrive silently: look while the box is in use.
  useEffect(() => {
    const t = setInterval(() => {
      if (box.current && document.activeElement === box.current) sync();
    }, 400);
    return () => clearInterval(t);
  }, []);
  // A paste that doesn't land (it happens now and then, with dictation apps especially): put it in ourselves.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const text = e.clipboardData.getData("text/plain");
    const before = el.value;
    const [start, end] = [el.selectionStart, el.selectionEnd];
    setTimeout(() => {
      if (text && el.value === before && el.isConnected) {
        el.setRangeText(text, start, end, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      sync();
    }, 50);
  };
  return <textarea ref={box} defaultValue={value} onInput={sync} onKeyUp={sync} onBlur={sync} onPaste={onPaste} {...props} />;
}
