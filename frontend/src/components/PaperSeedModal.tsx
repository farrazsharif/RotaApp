import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import AutoGrowTextarea from './AutoGrowTextarea';

// A reusable, date-only way to seed a schedule (spot checks, reviews, …) from a
// record already held on paper — so the next-due date is tracked without
// re-entering the whole digital form. The caller supplies the submit action.
export default function PaperSeedModal({
  title,
  subjectName,
  intro,
  dateLabel,
  personLabel,
  showNextDue,
  intervalMonths = 3,
  onSubmit,
  onSaved,
  onClose,
}: {
  title: string;
  subjectName: string;
  intro: string;
  dateLabel: string;
  personLabel: string;
  showNextDue: boolean;
  intervalMonths?: number;
  onSubmit: (v: { date: string; person: string; note: string; nextDue: string }) => Promise<unknown>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState('');
  const [person, setPerson] = useState('');
  const [note, setNote] = useState('');
  const [nextReview, setNextReview] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const suggestedNext = date ? format(addMonths(new Date(date), intervalMonths), 'yyyy-MM-dd') : '';
  const effectiveNext = nextReview || suggestedNext;

  const mut = useMutation({
    mutationFn: () => onSubmit({ date, person: person.trim(), note: note.trim(), nextDue: effectiveNext }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e: any) => setErr(e?.response?.data?.error || 'Could not save.'),
  });

  function save() {
    setErr(null);
    if (!date) { setErr('Enter the date it was held.'); return; }
    mut.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">📄 {title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            {intro} for <span className="font-medium text-gray-800">{subjectName}</span>.
          </p>
          <div>
            <label className="label">{dateLabel} *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={format(new Date(), 'yyyy-MM-dd')} className="input" />
          </div>
          <div>
            <label className="label">{personLabel} <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Who carried it out" className="input" />
          </div>
          {showNextDue && (
            <div>
              <label className="label">Next due</label>
              <input type="date" value={effectiveNext} onChange={(e) => setNextReview(e.target.value)} className="input" />
              {date && <p className="text-xs text-gray-400 mt-1">Defaults to {intervalMonths} months after the date — change it for a different interval.</p>}
            </div>
          )}
          {!showNextDue && date && (
            <p className="text-xs text-gray-400">Next due is set automatically to {intervalMonths} months after this date.</p>
          )}
          <div>
            <label className="label">Note <span className="text-gray-400 font-normal">(optional)</span></label>
            <AutoGrowTextarea value={note} onChange={(e) => setNote(e.target.value)} minRows={2} placeholder="e.g. held on paper, filed in folder" className="input" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} className="btn-secondary btn">Cancel</button>
          <button onClick={save} disabled={mut.isPending || !date} className="btn-primary btn">
            {mut.isPending ? 'Saving…' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
