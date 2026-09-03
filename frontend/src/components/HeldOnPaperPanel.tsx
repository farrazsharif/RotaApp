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
export default function HeldOnPaperPanel({ meta, ro, onChange }: {
  meta: PaperMeta;
  ro: boolean;
  onChange: (patch: PaperMeta) => void;
}) {
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
                : <input type="date" value={meta.completedDate || ''} onChange={(e) => onChange({ completedDate: e.target.value })} className="input text-sm" />}
          </div>
          <div>
            <label className="label">Next review date</label>
            {ro ? <p className="text-sm text-gray-800">{meta.reviewDate ? format(new Date(meta.reviewDate), 'dd MMM yyyy') : '—'}</p>
                : <input type="date" value={meta.reviewDate || ''} onChange={(e) => onChange({ reviewDate: e.target.value })} className="input text-sm" />}
          </div>
          <div>
            <label className="label">Assessor</label>
            {ro ? <p className="text-sm text-gray-800">{meta.assessor || '—'}</p>
                : <input type="text" value={meta.assessor || ''} onChange={(e) => onChange({ assessor: e.target.value })} className="input text-sm" placeholder="Name of assessor" />}
          </div>
          <p className="sm:col-span-3 text-xs text-gray-500">
            Attach the scanned form on the client's <span className="font-medium">Documents</span> tab. You can leave the rest of the form blank, or fill it in later at the next review.
          </p>
        </div>
      )}
    </div>
  );
}
