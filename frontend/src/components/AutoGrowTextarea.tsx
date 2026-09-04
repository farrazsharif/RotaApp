import { useRef, useLayoutEffect, forwardRef, TextareaHTMLAttributes, MutableRefObject } from 'react';

// A textarea that grows to fit its content as you type — no inner scrollbar.
// Works for both controlled fields (value + onChange) and uncontrolled ones
// (e.g. react-hook-form's {...register(...)}, which supplies its own ref):
//   - it forwards the ref, merging it with its own so RHF still wires up;
//   - it resizes on every `input` event (covers uncontrolled typing);
//   - and on `value` changes (covers controlled updates / loading data).
// `minRows` sets the starting height.

// The nearest ancestor that actually scrolls (e.g. a modal body), so we can
// keep its scroll position steady while the textarea resizes.
function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  // Measuring requires momentarily collapsing the box (height:auto). On a tall
  // field that shifts the surrounding scroll, so capture and restore it —
  // otherwise the page jumps on every keystroke.
  const sp = scrollParent(el);
  const top = sp ? sp.scrollTop : window.scrollY;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
  if (sp) { if (sp.scrollTop !== top) sp.scrollTop = top; }
  else if (window.scrollY !== top) window.scrollTo(0, top);
}

const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }
>(function AutoGrowTextarea({ value, minRows = 3, className = '', onInput, ...rest }, forwardedRef) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) (forwardedRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
    fit(el); // size once when mounted / re-attached
  };

  useLayoutEffect(() => { fit(innerRef.current); }, [value]);

  return (
    <textarea
      ref={setRef}
      value={value}
      rows={minRows}
      onInput={(e) => { fit(e.currentTarget); onInput?.(e); }}
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
});

export default AutoGrowTextarea;
