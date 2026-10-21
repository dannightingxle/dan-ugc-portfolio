import type { KeyboardEvent } from "react";

/** Chat boxes: Enter sends; Cmd+Enter (or Ctrl or Shift+Enter) starts a new line. */
export function chatKeys(send: () => void, setValue: (v: string) => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Typing with an input method (Japanese, emoji…): Enter picks the word, not send.
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.shiftKey) return; // the box adds the new line itself
    e.preventDefault();
    if (e.metaKey || e.ctrlKey || e.altKey) {
      // Typed in as if by the keyboard, so the cursor and undo behave; set by hand where that isn't supported.
      const box = e.currentTarget;
      if (!document.execCommand?.("insertText", false, "\n")) {
        const at = box.selectionStart;
        setValue(`${box.value.slice(0, at)}\n${box.value.slice(box.selectionEnd)}`);
        requestAnimationFrame(() => box.setSelectionRange(at + 1, at + 1));
      }
      return;
    }
    send();
  };
}

export const CHAT_KEYS_HINT = "Enter to send · ⌘ Enter for a new line";
