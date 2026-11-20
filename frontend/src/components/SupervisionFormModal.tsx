import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import SignatureField from './SignatureField';
import AutoGrowTextarea from './AutoGrowTextarea';
import { staffSupervisionApi, Supervision, SupervisionData } from '../api/staffSupervision';
import { SUPERVISION_QUESTIONS, SUPERVISION_OBSERVATIONS, parseMap, isSupervisionClosed } from '../lib/staffSupervision';
import { useAuth } from '../contexts/AuthContext';
import { useFormDraft } from '../lib/useFormDraft';
import { printSupervision } from '../lib/supervisionPrint';
import DraftSavedHint from './DraftSavedHint';

interface SupervisionForm {
  date: string;
  position: string;
  answers: Record<string, string>;
  serviceUsers: string;
  observations: Record<string, string>;
  assessorName: string;
  assessorSignature: string;
  staffSignature: string;
}

interface Props {
  userId: string;
  staffName: string;
  editSupervision?: Supervision | null;
  readOnly?: boolean;
  onClose: () => void;
}

export default function SupervisionFormModal({ userId, staffName, editSupervision, readOnly: locked = false, onClose }: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const s = editSupervision;

  // Signed by both people, or seeded from a signed paper form: a record of
  // something that happened, so it opens to be read rather than rewritten.
  // The next conversation belongs in a new supervision. An administrator can
  // still amend one, but has to choose to, and the server writes that to the
  // audit log.
  const closed = !!s && isSupervisionClosed(s);
  const [amending, setAmending] = useState(false);
  const readOnly = locked || (closed && !amending);

  // One draft per supervision being written: a new one for this staff member,
  // or the particular record being edited.
  const draft = useFormDraft<SupervisionForm>(`supervision:${userId}:${s?.id ?? 'new'}`, !readOnly);

  // Built from the live form rather than the saved record, so Print shows what
  // is on screen now.
  const printThis = () =>
    printSupervision(
      {
        id: s?.id || '',
        userId,
        date: form.date,
        nextReviewDate: form.date ? addMonths(new Date(form.date), 3).toISOString() : null,
        position: form.position,
        answers: JSON.stringify(form.answers),
        serviceUsers: form.serviceUsers,
        observations: JSON.stringify(form.observations),
        assessorName: form.assessorName,
        assessorSignature: form.assessorSignature,
        staffSignature: form.staffSignature,
        source: s?.source || 'form',
        note: s?.note || null,
        createdAt: s?.createdAt || new Date().toISOString(),
      },
      { staffName },
    );

  const [form, setForm] = useState<SupervisionForm>(() => ({
    date: s ? format(new Date(s.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    position: s?.position || '',
    answers: parseMap(s?.answers),
    serviceUsers: s?.serviceUsers || '',
    observations: parseMap(s?.observations),
    assessorName: s?.assessorName || '',
    assessorSignature: s?.assessorSignature || '',
    staffSignature: s?.staffSignature || '',
    // Whatever was left behind wins: it is newer than the saved record and it
    // is the work somebody is in the middle of.
    ...(draft.restored ?? {}),
  }));
  const [discarded, setDiscarded] = useState(false);

  // Not on the first run: opening a form and closing it again without typing
  // is not a draft, and storing one would greet them with "picked up where
  // you left off" every single time.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) {
      touched.current = true;
      return;
    }
    if (!readOnly) draft.keep(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, readOnly]);

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
    onSuccess: () => { draft.clear(); invalidate(); onClose(); },
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
          {closed && !amending && (
            <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span>
                🔒 {s?.source === 'paper'
                  ? 'Held on paper and filed — this is the record of it.'
                  : `Signed and closed${s ? ` on ${format(new Date(s.date), 'd MMM yyyy')}` : ''}.`}{' '}
                Record the next supervision as a new one.
              </span>
              <div className="flex-1" />
              {isAdmin && (
                <button type="button" className="text-xs underline hover:no-underline" onClick={() => setAmending(true)}>
                  Amend anyway
                </button>
              )}
            </div>
          )}
          {closed && amending && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Amending a signed record. This is written to the audit log — if this is a new conversation rather than a
              correction, close this and add a new supervision instead.
            </div>
          )}
          {/* Said out loud. Text reappearing with no explanation is unnerving,
              and somebody who meant to start again needs a way to do it. */}
          {draft.restored && !discarded && draft.restoredAt && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex flex-wrap items-center gap-2 text-sm text-blue-900">
              <span>
                Picked up where you left off — unsaved from {format(draft.restoredAt, 'd MMM, HH:mm')}.
              </span>
              <div className="flex-1" />
              <button
                type="button"
                className="text-xs underline hover:no-underline"
                onClick={() => {
                  draft.clear();
                  setDiscarded(true);
                  setForm({
                    date: s ? format(new Date(s.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                    position: s?.position || '',
                    answers: parseMap(s?.answers),
                    serviceUsers: s?.serviceUsers || '',
                    observations: parseMap(s?.observations),
                    assessorName: s?.assessorName || '',
                    assessorSignature: s?.assessorSignature || '',
                    staffSignature: s?.staffSignature || '',
                  });
                }}
              >
                Start again
              </button>
            </div>
          )}
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
                <SignatureField value={form.assessorSignature} ro={readOnly} onChange={(dataUrl) => setForm((f) => ({ ...f, assessorSignature: dataUrl }))} />
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <label className="label">Staff Name</label>
                <p className="text-sm text-gray-800 py-2">{staffName}</p>
              </div>
              <div>
                <label className="label">Staff Signature</label>
                <SignatureField value={form.staffSignature} ro={readOnly} signerLabel="staff" onChange={(dataUrl) => setForm((f) => ({ ...f, staffSignature: dataUrl }))} />
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex gap-3 p-6 border-t shrink-0">
          {/* Prints what is on screen, not what was last saved - so a form
              part-filled at the desk prints with the rest as ruled lines to
              finish in the room. */}
          <button className="btn-secondary btn gap-1.5" onClick={printThis}>🖨 Print</button>
          {!readOnly && <DraftSavedHint at={draft.savedAt} />}
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
