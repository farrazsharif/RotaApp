import { useRef, useLayoutEffect, TextareaHTMLAttributes } from 'react';

// A textarea that grows to fit its content as you type — no inner scrollbar.
// Height is recomputed on every value change (and on mount), so pasting or
// loading existing text sizes it correctly too. `minRows` sets the starting
// height.
export default function AutoGrowTextarea({
  value,
  minRows = 3,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}
