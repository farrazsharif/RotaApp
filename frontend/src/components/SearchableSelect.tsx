import { useState, useRef, useEffect, useMemo } from 'react';

export interface SearchableOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
}

// A single-select dropdown you can type into to filter — a searchable
// replacement for a long <select> (e.g. picking one carer from 50+).
export default function SearchableSelect({ value, onChange, options, placeholder = 'Select…', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); setActive(0); }}
        className="input w-full text-left flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>{selected ? selected.label : placeholder}</span>
        <span className="text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active].value); }
                else if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Type to search…"
              className="input w-full text-sm"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1 text-sm">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-gray-400">No matches</li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2 ${i === active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'} ${o.value === value ? 'font-semibold' : ''}`}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
