const FOCUSABLE = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "summary",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function visibleFocusables(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'));
}

export function activateDialogFocus(
  dialog: HTMLElement,
  initialFocus: HTMLElement,
  onEscape: () => void,
): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = visibleFocusables(dialog);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  };
  dialog.addEventListener("keydown", onKeyDown);
  initialFocus.focus();
  return () => {
    dialog.removeEventListener("keydown", onKeyDown);
    previous?.focus();
  };
}
