import { useEffect, useRef, useState } from 'react';

interface Option { value: string; label: string }

// A scrolling list of options for picking a SINGLE value (e.g. one service
// user). No checkboxes — clicking a name selects it and closes the list;
// "all" clears the pick. Kept on the same array-shaped interface as
// MultiSelectDropdown (0 or 1 entries) so callers don't need to change their
// state, but only ever one option can be chosen.
export default function SingleSelectDropdown({
  options,
  selected,
  onChange,
  allLabel = 'All',
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = selected[0];
  const pick = (v: string) => { onChange([v]); setOpen(false); };
  const clear = () => { onChange([]); setOpen(false); };

  const label = current ? (options.find((o) => o.value === current)?.label ?? '1 selected') : allLabel;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="input w-full flex items-center justify-between text-left">
        <span className={current ? '' : 'text-gray-500'}>{label}</span>
        <span className="text-gray-400 text-xs ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-1">
          <button
            type="button"
            onClick={clear}
            className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-50 ${!current ? 'font-semibold text-blue-600' : 'text-gray-600'}`}
          >
            {allLabel}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-50 ${o.value === current ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-700'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
