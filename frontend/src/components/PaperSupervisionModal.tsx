import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import { staffSupervisionApi } from '../api/staffSupervision';
import AutoGrowTextarea from './AutoGrowTextarea';

// A lightweight, date-only way to seed the supervision schedule from a
// supervision that was already held on paper — so the next-due date is tracked
// without re-entering the whole digital form. Saved as a "paper" record.
export default function PaperSupervisionModal({ userId, staffName, onClose }: { userId: string; staffName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [assessorName, setAssessorName] = useState('');
  const [note, setNote] = useState('');
  const [nextReview, setNextReview] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Suggested next-due = date + 3 months (the standard cadence). Prefills when a
  // date is picked; the manager can override it for a different interval.
  const suggestedNext = date ? format(addMonths(new Date(date), 3), 'yyyy-MM-dd') : '';
  const effectiveNext = nextReview || suggestedNext;

  const mut = useMutation({
    mutationFn: () => staffSupervisionApi.create({
      userId,
      date,
      assessorName: assessorName.trim() || undefined,
      note: note.trim() || undefined,
      source: 'paper',
      nextReviewDate: effectiveNext || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisions'] });
      qc.invalidateQueries({ queryKey: ['supervision-summary'] });
      onClose();
    },
    onError: (e: any) => setErr(e?.response?.data?.error || 'Could not save.'),
  });

  function save() {
    setErr(null);
    if (!date) { setErr('Enter the date the supervision was held.'); return; }
    mut.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">📄 Record previous supervision</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Seed the schedule for <span className="font-medium text-gray-800">{staffName}</span> from a supervision held on paper — the next one defaults to 3 months later.
          </p>
          <div>
            <label className="label">Date held (on paper) *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={format(new Date(), 'yyyy-MM-dd')} className="input" />
          </div>
          <div>
            <label className="label">Supervisor / assessor <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} placeholder="Who carried it out" className="input" />
          </div>
          <div>
            <label className="label">Next supervision due</label>
            <input type="date" value={effectiveNext} onChange={(e) => setNextReview(e.target.value)} className="input" />
            {date && <p className="text-xs text-gray-400 mt-1">Defaults to 3 months after the date held — change it for a different interval.</p>}
          </div>
          <div>
            <label className="label">Note <span className="text-gray-400 font-normal">(optional)</span></label>
            <AutoGrowTextarea value={note} onChange={(e) => setNote(e.target.value)} minRows={2} placeholder="e.g. held on paper, filed in staff folder" className="input" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} className="btn-secondary btn">Cancel</button>
          <button onClick={save} disabled={mut.isPending || !date} className="btn-primary btn">
            {mut.isPending ? 'Saving…' : 'Record supervision'}
          </button>
        </div>
      </div>
    </div>
  );
}
