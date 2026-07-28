// Auto-cleans whitespace in pasted text the moment it's dropped into a field.
// Copying from spreadsheets, PDFs or emails often brings stray leading/trailing
// spaces, doubled spaces or trailing line breaks — this normalises them on
// paste so the saved data is tidy, without getting in the way of typing.

// Only single-line text-like inputs. Excludes password (spaces may be
// intentional) and non-text types (number, date, time, etc.).
const SINGLE_LINE_TYPES = new Set(['', 'text', 'search', 'tel', 'url', 'email']);

function normalize(text: string, multiline: boolean): string {
  if (multiline) {
    // Keep line breaks (addresses, notes) but tidy spaces within/around them.
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  }
  // Single line: collapse every run of whitespace to one space, trim the ends.
  return text.replace(/\s+/g, ' ').trim();
}

// Replace the current selection with `insert`, updating a React-controlled
// field by firing a native input event. Used only if execCommand is missing.
function fallbackInsert(el: HTMLInputElement | HTMLTextAreaElement, insert: string) {
  const supportsSel = el.selectionStart != null;
  const next = supportsSel
    ? el.value.slice(0, el.selectionStart!) + insert + el.value.slice(el.selectionEnd!)
    : insert;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, next); else el.value = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (supportsSel) {
    const pos = el.selectionStart! + insert.length;
    try { el.setSelectionRange(pos, pos); } catch { /* type doesn't support selection */ }
  }
}

export function installPasteNormalizer() {
  document.addEventListener(
    'paste',
    (e) => {
      const el = e.target as HTMLElement | null;
      const isInput = el instanceof HTMLInputElement && SINGLE_LINE_TYPES.has(el.type);
      const isTextarea = el instanceof HTMLTextAreaElement;
      if (!isInput && !isTextarea) return;
      const field = el as HTMLInputElement | HTMLTextAreaElement;
      if (field.readOnly || field.disabled) return;

      const text = e.clipboardData?.getData('text');
      if (!text) return;
      const cleaned = normalize(text, isTextarea);
      if (cleaned === text) return; // already tidy — let the browser paste normally

      e.preventDefault();
      // execCommand('insertText') respects the cursor/selection and fires a
      // native input event that React picks up; fall back if unavailable.
      let ok = false;
      try { ok = document.execCommand('insertText', false, cleaned); } catch { ok = false; }
      if (!ok) fallbackInsert(field, cleaned);
    },
    true,
  );
}
