import { useEffect, useRef, useState } from 'react';

interface Option { value: string; label: string }

// A dropdown of checkboxes for picking any number of options (e.g. filter by
// several locations at once). Empty selection = "all".
export default function MultiSelectDropdown({
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

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const label = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? '1 selected')
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="input w-full flex items-center justify-between text-left">
        <span className={selected.length ? '' : 'text-gray-500'}>{label}</span>
        <span className="text-gray-400 text-xs ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-50 ${selected.length === 0 ? 'font-semibold text-blue-600' : 'text-gray-600'}`}
          >
            {allLabel}
          </button>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 accent-blue-600" />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
