import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { usersApi } from '../api/users';
import { serviceUsersApi } from '../api/serviceUsers';
import { supervisionApi, YesNoNa } from '../api/supervision';
import { useAuth } from '../contexts/AuthContext';
import { SPOT_CHECK_ITEMS } from '../lib/spotCheckSchema';
import SearchableSelect from './SearchableSelect';
import SignatureField from './SignatureField';
import AutoGrowTextarea from './AutoGrowTextarea';
import { useFormDraft } from '../lib/useFormDraft';
import DraftSavedHint from './DraftSavedHint';

interface SpotCheckForm {
  carerId: string;
  serviceUserId: string;
  date: string;
  time: string;
  location: string;
  answers: Answers;
  generalComments: string;
  observerName: string;
  observerSignature: string;
}

type Answers = Record<string, { answer: YesNoNa; comment: string }>;

function emptyAnswers(): Answers {
  const a: Answers = {};
  for (const it of SPOT_CHECK_ITEMS) a[it.id] = { answer: '', comment: '' };
  return a;
}

export default function SpotCheckModal({ onClose, carerId: initialCarerId, viewId, editId }: { onClose: () => void; carerId?: string; viewId?: string; editId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const readOnly = !!viewId;
  const isEdit = !!editId;
  const loadId = viewId || editId;

  const { data: existing } = useQuery({ queryKey: ['spot-check', loadId], queryFn: () => supervisionApi.getSpotCheck(loadId!), enabled: !!loadId });
  // All active staff except admins (carers, managers, coordinators, field
  // supervisors) — anyone who might do visits and be spot-checked.
  const { data: staff = [] } = useQuery({ queryKey: ['users', 'spot-check-staff'], queryFn: () => usersApi.list({ active: true }), enabled: !readOnly });
  const carers = staff.filter((u) => u.role !== 'ADMIN');
  const { data: serviceUsers = [] } = useQuery({ queryKey: ['service-users', 'active'], queryFn: () => serviceUsersApi.list({ active: true }), enabled: !readOnly });

  // One draft per spot check being written: a new one, or the record being
  // edited. Viewing never keeps a draft.
  const draft = useFormDraft<SpotCheckForm>(`spotcheck:${editId ?? 'new'}`, !readOnly);
  const d = draft.restored;
  const [discarded, setDiscarded] = useState(false);

  const [carerId, setCarerId] = useState(d?.carerId ?? (initialCarerId || ''));
  const [serviceUserId, setServiceUserId] = useState(d?.serviceUserId ?? '');
  const [date, setDate] = useState(d?.date ?? format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(d?.time ?? format(new Date(), 'HH:mm'));
  const [location, setLocation] = useState(d?.location ?? '');
  const [answers, setAnswers] = useState<Answers>(() => d?.answers ?? emptyAnswers());
  const [generalComments, setGeneralComments] = useState(d?.generalComments ?? '');
  const [observerName, setObserverName] = useState(
    d?.observerName ?? (user ? `${user.firstName} ${user.lastName}` : ''),
  );
  const [observerSignature, setObserverSignature] = useState(d?.observerSignature ?? '');

  const current = (): SpotCheckForm => ({
    carerId, serviceUserId, date, time, location, answers, generalComments, observerName, observerSignature,
  });

  // Not on the first run: opening a form and closing it without typing is not
  // a draft, and storing one would greet them with "picked up where you left
  // off" every time.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) {
      touched.current = true;
      return;
    }
    if (!readOnly) draft.keep(current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carerId, serviceUserId, date, time, location, answers, generalComments, observerName, observerSignature, readOnly]);

  const setAnswer = (id: string, patch: Partial<{ answer: YesNoNa; comment: string }>) =>
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));

  // Seed the editable form once from the existing record when editing.
  const seededRef = useRef(false);
  useEffect(() => {
    // A restored draft is newer than the stored record and is the work in
    // progress, so seeding over it would undo exactly what was rescued.
    if (!isEdit || seededRef.current || !existing || (d && !discarded)) return;
    seededRef.current = true;
    setCarerId(existing.carerId);
    setServiceUserId(existing.serviceUserId || '');
    setDate(format(new Date(existing.date), 'yyyy-MM-dd'));
    setTime(existing.time || '');
    setLocation(existing.location || '');
    try { setAnswers({ ...emptyAnswers(), ...JSON.parse(existing.answers) }); } catch { /* keep defaults */ }
    setGeneralComments(existing.generalComments || '');
    setObserverName(existing.observerName || '');
    setObserverSignature(existing.observerSignature || '');
  }, [isEdit, existing]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { carerId, serviceUserId: serviceUserId || undefined, date, time, location, answers, generalComments, observerName, observerSignature: observerSignature || undefined };
      return editId ? supervisionApi.updateSpotCheck(editId, payload) : supervisionApi.createSpotCheck(payload);
    },
    onSuccess: () => {
      draft.clear();
      qc.invalidateQueries({ queryKey: ['supervision-summary'] });
      qc.invalidateQueries({ queryKey: ['spot-checks'] });
      onClose();
    },
  });

  const viewAnswers: Answers = (() => {
    if (!existing) return emptyAnswers();
    try { return { ...emptyAnswers(), ...JSON.parse(existing.answers) }; } catch { return emptyAnswers(); }
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-gray-900">{readOnly ? 'Spot check' : isEdit ? 'Edit Spot Check' : 'New carer spot check'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Said out loud. Text reappearing with no explanation is unnerving,
              and somebody who meant to start again needs a way to do it. */}
          {d && !discarded && draft.restoredAt && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex flex-wrap items-center gap-2 text-sm text-blue-900">
              <span>Picked up where you left off — unsaved from {format(draft.restoredAt, 'd MMM, HH:mm')}.</span>
              <div className="flex-1" />
              <button
                type="button"
                className="text-xs underline hover:no-underline"
                onClick={() => {
                  draft.clear();
                  setDiscarded(true);
                  setCarerId(initialCarerId || '');
                  setServiceUserId('');
                  setDate(format(new Date(), 'yyyy-MM-dd'));
                  setTime(format(new Date(), 'HH:mm'));
                  setLocation('');
                  setAnswers(emptyAnswers());
                  setGeneralComments('');
                  setObserverName(user ? `${user.firstName} ${user.lastName}` : '');
                  setObserverSignature('');
                  // Let the stored record seed the form again when editing.
                  seededRef.current = false;
                }}
              >
                Start again
              </button>
            </div>
          )}
          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Carer *</label>
              {readOnly ? (
                <p className="text-sm text-gray-800">{existing ? `${existing.carer?.firstName} ${existing.carer?.lastName}` : '—'}</p>
              ) : (
                <SearchableSelect
                  value={carerId}
                  onChange={setCarerId}
                  options={carers.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                  placeholder="Select carer"
                  className="w-full"
                />
              )}
            </div>
            <div>
              <label className="label">Service user / visit</label>
              {readOnly ? (
                <p className="text-sm text-gray-800">{existing?.serviceUser ? `${existing.serviceUser.firstName} ${existing.serviceUser.lastName}` : '—'}</p>
              ) : (
                <SearchableSelect
                  value={serviceUserId}
                  onChange={setServiceUserId}
                  options={[
                    { value: '', label: 'Not specified' },
                    ...serviceUsers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
                  ]}
                  placeholder="Not specified"
                  className="w-full"
                />
              )}
            </div>
            <div>
              <label className="label">Date</label>
              {readOnly ? <p className="text-sm text-gray-800">{existing ? format(new Date(existing.date), 'dd MMM yyyy') : '—'}</p>
                : <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Time</label>
                {readOnly ? <p className="text-sm text-gray-800">{existing?.time || '—'}</p>
                  : <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" />}
              </div>
              <div>
                <label className="label">Location</label>
                {readOnly ? <p className="text-sm text-gray-800">{existing?.location || '—'}</p>
                  : <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" placeholder="e.g. home visit" />}
              </div>
            </div>
          </div>

          {/* Observation checklist */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Observation</h3>
            {SPOT_CHECK_ITEMS.map((it) => {
              const val = readOnly ? viewAnswers[it.id] : answers[it.id];
              return (
                <div key={it.id} className="border-b border-gray-100 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm text-gray-800">{it.label}</span>
                    {readOnly ? (
                      <span className={`text-sm font-medium flex-shrink-0 ${val.answer === 'NO' ? 'text-red-600' : val.answer === 'YES' ? 'text-green-700' : 'text-gray-400'}`}>{val.answer || '—'}</span>
                    ) : (
                      <span className="flex gap-2 flex-shrink-0 text-sm">
                        {(['YES', 'NO', 'NA'] as const).map((opt) => (
                          <label key={opt} className="flex items-center gap-1">
                            <input type="radio" checked={val.answer === opt} onChange={() => setAnswer(it.id, { answer: opt })} />
                            {opt === 'NA' ? 'N/A' : opt === 'YES' ? 'Yes' : 'No'}
                          </label>
                        ))}
                      </span>
                    )}
                  </div>
                  {(readOnly ? val.comment : true) && (
                    readOnly
                      ? val.comment && <p className="text-xs text-gray-600 mt-1">{val.comment}</p>
                      : <input value={val.comment} onChange={(e) => setAnswer(it.id, { comment: e.target.value })} className="input mt-1.5 text-sm" placeholder="Comment (optional)" />
                  )}
                </div>
              );
            })}
          </div>

          {/* General comments */}
          <div>
            <label className="label">General comments</label>
            {readOnly ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{existing?.generalComments || '—'}</p>
            ) : (
              <AutoGrowTextarea value={generalComments} minRows={3} onChange={(e) => setGeneralComments(e.target.value)} className="input text-sm" placeholder="Appearance, footwear, jewellery, nails, attitude, communication skills, etc." />
            )}
          </div>

          {/* Observer */}
          <div className="border-t pt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Observer</label>
              {readOnly ? <p className="text-sm text-gray-800">{existing?.observerName || '—'}</p>
                : <input value={observerName} onChange={(e) => setObserverName(e.target.value)} className="input" />}
            </div>
            <div>
              <label className="label">Observer signature</label>
              <SignatureField value={readOnly ? (existing?.observerSignature || '') : observerSignature} ro={readOnly} onChange={setObserverSignature} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t">
          {!readOnly && <DraftSavedHint at={draft.savedAt} />}
          <div className="flex-1" />
          <button className="btn-secondary btn" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && (
            <button className="btn-primary btn" disabled={!carerId || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save spot check'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
