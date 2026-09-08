import { useState } from 'react';
import { format } from 'date-fns';
import SignaturePad from './SignaturePad';

// A signature field that supports two ways to sign:
//   - Type (e-sign): the signer types their full name and ticks a confirmation
//     box. Stored as a JSON string {"kind":"esign","name":..,"at":<ISO>} and
//     rendered as the name in a handwriting font with a green "eSigned" pill.
//   - Draw: delegates to the existing SignaturePad; stored as a PNG data URL.
//
// The stored `value` is always a plain string in the existing JSON field, so
// there are no backend/schema changes. Read-only render and the print builder
// both use parseSignature() below to detect which kind a value is.

// Font stack for the rendered typed signature. "Caveat" is loaded via a
// <link> in index.html; the rest are graceful fallbacks.
export const SIGNATURE_FONT = "'Caveat', 'Segoe Script', 'Bradley Hand', cursive";

export type ParsedSignature =
  | { kind: 'empty' }
  | { kind: 'drawn'; dataUrl: string }
  | { kind: 'esign'; name: string; at: string }
  | { kind: 'text'; name: string };

// Detect what a stored signature value is. Shared by the read-only render and
// the print builder so both treat each kind the same way.
export function parseSignature(value: string | undefined | null): ParsedSignature {
  const v = (value || '').trim();
  if (!v) return { kind: 'empty' };
  if (v.startsWith('data:')) return { kind: 'drawn', dataUrl: v };
  if (v.startsWith('{')) {
    try {
      const o = JSON.parse(v);
      if (o && o.kind === 'esign' && typeof o.name === 'string') {
        return { kind: 'esign', name: o.name, at: typeof o.at === 'string' ? o.at : '' };
      }
    } catch {
      /* fall through to defensive plain-text */
    }
  }
  // Any other non-empty legacy string: treat as a plain typed name.
  return { kind: 'text', name: v };
}

// Format an ISO timestamp for display under an e-signature.
function fmtAt(at: string): string {
  if (!at) return '';
  const d = new Date(at);
  if (isNaN(d.getTime())) return '';
  return format(d, 'dd MMM yyyy, h:mm a');
}

// The green "eSigned" badge + name, shared by the live preview and read-only.
function ESignRender({ name, at }: { name: string; at: string }) {
  return (
    <div className="border rounded-lg bg-white p-3">
      <div className="leading-none text-3xl text-gray-900" style={{ fontFamily: SIGNATURE_FONT }}>
        {name}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="badge-green badge">eSigned &#10003;</span>
        {at && <span className="text-xs text-gray-500">{fmtAt(at)}</span>}
      </div>
    </div>
  );
}

interface Props {
  value: string;
  ro: boolean;
  onChange: (value: string) => void;
  signerLabel?: string; // e.g. "tenant" — used in the confirmation wording
}

export default function SignatureField({ value, ro, onChange, signerLabel }: Props) {
  const parsed = parseSignature(value);

  // Hooks must run unconditionally (before the read-only early return).
  // Default to Type mode; start in Draw if the stored value is a drawn image so
  // an existing drawing keeps editing in the right mode.
  const [mode, setMode] = useState<'type' | 'draw'>(parsed.kind === 'drawn' ? 'draw' : 'type');
  // Local Type-mode state, seeded from any stored e-sign / plain-text value.
  const [name, setName] = useState(parsed.kind === 'esign' || parsed.kind === 'text' ? parsed.name : '');
  const [confirmed, setConfirmed] = useState(parsed.kind === 'esign');

  // Read-only render: detect the kind and render accordingly.
  if (ro) {
    if (parsed.kind === 'drawn') {
      return <img src={parsed.dataUrl} alt="signature" className="border rounded-lg bg-white max-h-32" />;
    }
    if (parsed.kind === 'esign') {
      return <ESignRender name={parsed.name} at={parsed.at} />;
    }
    if (parsed.kind === 'text') {
      return (
        <div className="border rounded-lg bg-white p-3">
          <div className="leading-none text-3xl text-gray-900" style={{ fontFamily: SIGNATURE_FONT }}>{parsed.name}</div>
        </div>
      );
    }
    return <p className="text-sm text-gray-400 border rounded-lg p-3 bg-gray-50">Not signed</p>;
  }

  const whose = signerLabel ? `this is my (${signerLabel}) signature` : 'this is my signature';

  const emit = (nextName: string, nextConfirmed: boolean) => {
    const n = nextName.trim();
    if (n && nextConfirmed) {
      onChange(JSON.stringify({ kind: 'esign', name: n, at: new Date().toISOString() }));
    } else {
      onChange('');
    }
  };

  const onName = (v: string) => { setName(v); emit(v, confirmed); };
  const onConfirm = (v: boolean) => { setConfirmed(v); emit(name, v); };

  const switchMode = (m: 'type' | 'draw') => {
    if (m === mode) return;
    setMode(m);
    onChange(''); // clear when switching so the two modes never mix
    if (m === 'type') { setName(''); setConfirmed(false); }
  };

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => switchMode('type')}
          className={`px-3 py-1 ${mode === 'type' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          Type (e-sign)
        </button>
        <button
          type="button"
          onClick={() => switchMode('draw')}
          className={`px-3 py-1 border-l border-gray-300 ${mode === 'draw' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          Draw
        </button>
      </div>

      {mode === 'draw' ? (
        <SignaturePad value={parsed.kind === 'drawn' ? value : ''} ro={false} onChange={onChange} />
      ) : (
        <div className="space-y-2">
          <input
            className="input text-sm"
            placeholder="Full name"
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={confirmed}
              onChange={(e) => onConfirm(e.target.checked)}
            />
            I confirm {whose}
          </label>
          {name.trim() && confirmed ? (
            <ESignRender name={name.trim()} at={new Date().toISOString()} />
          ) : (
            <p className="text-xs text-gray-400">Type a full name and tick the box to e-sign.</p>
          )}
        </div>
      )}
    </div>
  );
}
