import { useRef, useLayoutEffect, forwardRef, TextareaHTMLAttributes, MutableRefObject } from 'react';

// A textarea that grows to fit its content as you type — no inner scrollbar.
// Works for both controlled fields (value + onChange) and uncontrolled ones
// (e.g. react-hook-form's {...register(...)}, which supplies its own ref):
//   - it forwards the ref, merging it with its own so RHF still wires up;
//   - it resizes on every `input` event (covers uncontrolled typing);
//   - and on `value` changes (covers controlled updates / loading data).
// `minRows` sets the starting height.

function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
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
