import { useRef } from 'react';
import { format } from 'date-fns';

// Metadata for an assessment/plan that's held on paper (scan attached in
// Documents) rather than filled in digitally. Stored under a reserved __paper
// key inside the assessment's JSON blob so it can't collide with form fields.
export interface PaperMeta {
  onFile?: boolean;
  completedDate?: string;
  reviewDate?: string;
  assessor?: string;
}

// A shared banner offering "this is held on paper" logging: tick it and record
// just the essentials (date completed, review due, assessor) without filling in
// the whole form. Used by the Risk Assessment, Service Plan and Support Plan
// modals.
export default function HeldOnPaperPanel({ meta, ro, onChange, docExists }: {
  meta: PaperMeta;
  ro: boolean;
  onChange: (patch: PaperMeta) => void;
  // True once the software already holds this document (a saved record exists,
  // whether created through the app or seeded from paper). The "held on paper"
  // banner is only a bootstrap for a brand-new, empty document, so it's hidden
  // as soon as the record exists.
  docExists?: boolean;
}) {
  // Also latch on a captured paper date: the parent seeds `meta` from the server
  // in one shot AFTER the async load, so we can't just read it at mount (it's
  // still empty then). Latching on that first non-empty state means it never
  // disappears while the user is first typing the date on a fresh record.
  const latch = useRef<{ decided: boolean; hide: boolean }>({ decided: false, hide: false });
  // Once the user hand-edits the next-review date we stop auto-deriving it, so a
  // deliberate non-standard review interval is never overwritten. Declared here
  // (before any early return) so the hook is always called — Rules of Hooks.
  const reviewTouched = useRef(false);
  if (!latch.current.decided) {
    const hasContent = !!(meta.onFile || meta.completedDate || meta.reviewDate || meta.assessor);
    if (hasContent) latch.current = { decided: true, hide: !!(meta.completedDate || meta.reviewDate) };
  }
  // Hidden once the software has the document (saved record) or a paper date is
  // on file — from then on it's managed in the app, so the bootstrap is gone.
  if (docExists || latch.current.hide) return null;

  // These documents are reviewed yearly, so the next review is exactly one year
  // after the date completed. tz-safe (parse the y-m-d parts, don't let UTC
  // parsing shift the day). Feb 29 rolls to Mar 1, which is fine.
  const addYear = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    if (!y || !m || !day) return '';
    return format(new Date(y + 1, m - 1, day), 'yyyy-MM-dd');
  };

  // Entering the completed date auto-fills the next review a year on (the yearly
  // cycle) unless the user has set their own review date.
  const onCompleted = (c: string) => {
    const patch: PaperMeta = { completedDate: c };
    if (c && !reviewTouched.current) patch.reviewDate = addYear(c);
    onChange(patch);
  };

  // One-click renewal: mark the assessment reviewed today and set the next
  // review a year on, so a field supervisor can renew without hand-typing dates.
  const renew = () => {
    const today = new Date();
    reviewTouched.current = false;
    onChange({ completedDate: format(today, 'yyyy-MM-dd'), reviewDate: addYear(format(today, 'yyyy-MM-dd')) });
  };
  return (
    <div className="border-b bg-amber-50/60 px-5 py-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <input type="checkbox" checked={!!meta.onFile} disabled={ro} onChange={(e) => onChange({ onFile: e.target.checked })} className="h-4 w-4 accent-amber-600" />
        📄 This is held on paper (scan attached in Documents)
      </label>
      {meta.onFile && (
        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          <div>
            <label className="label">Date completed</label>
            {ro ? <p className="text-sm text-gray-800">{meta.completedDate ? format(new Date(meta.completedDate), 'dd MMM yyyy') : '—'}</p>
                : <input type="date" value={meta.completedDate || ''} onChange={(e) => onCompleted(e.target.value)} className="input text-sm" />}
          </div>
          <div>
            <label className="label">Next review date</label>
            {ro ? <p className="text-sm text-gray-800">{meta.reviewDate ? format(new Date(meta.reviewDate), 'dd MMM yyyy') : '—'}</p>
                : <input type="date" value={meta.reviewDate || ''} onChange={(e) => { reviewTouched.current = true; onChange({ reviewDate: e.target.value }); }} className="input text-sm" />}
            {!ro && <p className="text-[11px] text-gray-500 mt-1">Auto-set to a year after the completed date — change it if needed.</p>}
          </div>
          <div>
            <label className="label">Assessor</label>
            {ro ? <p className="text-sm text-gray-800">{meta.assessor || '—'}</p>
                : <input type="text" value={meta.assessor || ''} onChange={(e) => onChange({ assessor: e.target.value })} className="input text-sm" placeholder="Name of assessor" />}
          </div>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            {!ro && (
              <button type="button" onClick={renew} className="btn-secondary btn btn-sm shrink-0" title="Mark reviewed today and set the next review a year on">
                ↻ Renew — reviewed today
              </button>
            )}
            <p className="text-xs text-gray-500 flex-1 min-w-[12rem]">
              Attach the scanned form on the client's <span className="font-medium">Documents</span> tab.{!ro && ' “Renew” sets today as completed and the review a year on — then Save.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
