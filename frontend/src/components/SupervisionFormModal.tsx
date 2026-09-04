import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import SignaturePad from './SignaturePad';
import AutoGrowTextarea from './AutoGrowTextarea';
import { staffSupervisionApi, Supervision, SupervisionData } from '../api/staffSupervision';
import { SUPERVISION_QUESTIONS, SUPERVISION_OBSERVATIONS, parseMap } from '../lib/staffSupervision';

interface Props {
  userId: string;
  staffName: string;
  editSupervision?: Supervision | null;
  readOnly?: boolean;
  onClose: () => void;
}

export default function SupervisionFormModal({ userId, staffName, editSupervision, readOnly = false, onClose }: Props) {
  const qc = useQueryClient();
  const s = editSupervision;
  const [form, setForm] = useState({
    date: s ? format(new Date(s.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    position: s?.position || '',
    answers: parseMap(s?.answers),
    serviceUsers: s?.serviceUsers || '',
    observations: parseMap(s?.observations),
    assessorName: s?.assessorName || '',
    assessorSignature: s?.assessorSignature || '',
    staffSignature: s?.staffSignature || '',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['supervisions'] });
    qc.invalidateQueries({ queryKey: ['supervisions', userId] });
    qc.invalidateQueries({ queryKey: ['supervision-summary'] });
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: SupervisionData = {
        userId,
        date: form.date,
        position: form.position || undefined,
        answers: JSON.stringify(form.answers),
        serviceUsers: form.serviceUsers || undefined,
        observations: JSON.stringify(form.observations),
        assessorName: form.assessorName || undefined,
        assessorSignature: form.assessorSignature || undefined,
        staffSignature: form.staffSignature || undefined,
      };
      return s ? staffSupervisionApi.update(s.id, payload) : staffSupervisionApi.create(payload);
    },
    onSuccess: () => { invalidate(); onClose(); },
  });

  const setAnswer = (k: string, v: string) => setForm((f) => ({ ...f, answers: { ...f.answers, [k]: v } }));
  const setObs = (k: string, v: string) => setForm((f) => ({ ...f, observations: { ...f.observations, [k]: v } }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6 sm:my-0 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b shrink-0">
          <h2 className="text-lg font-semibold">{readOnly ? 'Supervision' : s ? 'Edit Supervision' : 'New Supervision'} — {staffName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <fieldset disabled={readOnly} className="p-6 space-y-5 overflow-y-auto border-0 m-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Position</label>
              <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="input" placeholder="e.g. Carer" />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
              {form.date && (
                <p className="mt-1 text-xs text-gray-500">Next review: <span className="font-medium text-gray-700">{format(addMonths(new Date(form.date), 3), 'dd MMM yyyy')}</span></p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Service Detail</p>
            <div className="rounded-lg border border-gray-200 px-3">
              {SUPERVISION_QUESTIONS.map((q) => (
                <div key={q.key} className="flex items-center justify-between gap-3 border-b border-gray-100 py-1.5 last:border-b-0">
                  <span className="text-sm text-gray-800">{q.label}</span>
                  <span className="flex gap-3 flex-shrink-0 text-sm">
                    <label className="flex items-center gap-1"><input type="radio" name={`sup-${q.key}`} checked={form.answers[q.key] === 'YES'} onChange={() => setAnswer(q.key, 'YES')} /> Yes</label>
                    <label className="flex items-center gap-1"><input type="radio" name={`sup-${q.key}`} checked={form.answers[q.key] === 'NO'} onChange={() => setAnswer(q.key, 'NO')} /> No</label>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Service Users & Days Worked</label>
            <AutoGrowTextarea value={form.serviceUsers} onChange={(e) => setForm({ ...form, serviceUsers: e.target.value })} minRows={3} className="input" placeholder="Client names and the days the staff member works" />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">Observations & Comments</p>
            {SUPERVISION_OBSERVATIONS.map((o) => (
              <div key={o.key}>
                <label className="label">{o.label}</label>
                <AutoGrowTextarea value={form.observations[o.key] || ''} onChange={(e) => setObs(o.key, e.target.value)} minRows={2} className="input text-sm" />
              </div>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 border-t pt-4">
            <div className="space-y-2">
              <div>
                <label className="label">Assessor Name</label>
                <input value={form.assessorName} onChange={(e) => setForm({ ...form, assessorName: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Assessor Signature</label>
                <SignaturePad value={form.assessorSignature} ro={readOnly} onChange={(dataUrl) => setForm((f) => ({ ...f, assessorSignature: dataUrl }))} />
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <label className="label">Staff Name</label>
                <p className="text-sm text-gray-800 py-2">{staffName}</p>
              </div>
              <div>
                <label className="label">Staff Signature</label>
                <SignaturePad value={form.staffSignature} ro={readOnly} onChange={(dataUrl) => setForm((f) => ({ ...f, staffSignature: dataUrl }))} />
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex gap-3 p-6 border-t shrink-0">
          <div className="flex-1" />
          <button className="btn-secondary btn" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && (
            <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : s ? 'Save Changes' : 'Save Supervision'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
