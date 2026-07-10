import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { usersApi } from '../api/users';
import { serviceUsersApi } from '../api/serviceUsers';
import { supervisionApi, YesNoNa } from '../api/supervision';
import { useAuth } from '../contexts/AuthContext';
import { SPOT_CHECK_ITEMS } from '../lib/spotCheckSchema';
import SignaturePad from './SignaturePad';

type Answers = Record<string, { answer: YesNoNa; comment: string }>;

function emptyAnswers(): Answers {
  const a: Answers = {};
  for (const it of SPOT_CHECK_ITEMS) a[it.id] = { answer: '', comment: '' };
  return a;
}

export default function SpotCheckModal({ onClose, carerId: initialCarerId, viewId }: { onClose: () => void; carerId?: string; viewId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const readOnly = !!viewId;

  const { data: existing } = useQuery({ queryKey: ['spot-check', viewId], queryFn: () => supervisionApi.getSpotCheck(viewId!), enabled: readOnly });
  const { data: carers = [] } = useQuery({ queryKey: ['users', 'carers'], queryFn: () => usersApi.list({ role: 'EMPLOYEE', active: true }), enabled: !readOnly });
  const { data: serviceUsers = [] } = useQuery({ queryKey: ['service-users', 'active'], queryFn: () => serviceUsersApi.list({ active: true }), enabled: !readOnly });

  const [carerId, setCarerId] = useState(initialCarerId || '');
  const [serviceUserId, setServiceUserId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [location, setLocation] = useState('');
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [generalComments, setGeneralComments] = useState('');
  const [observerName, setObserverName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [observerSignature, setObserverSignature] = useState('');

  const setAnswer = (id: string, patch: Partial<{ answer: YesNoNa; comment: string }>) =>
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));

  const saveMut = useMutation({
    mutationFn: () => supervisionApi.createSpotCheck({ carerId, serviceUserId: serviceUserId || undefined, date, time, location, answers, generalComments, observerName, observerSignature: observerSignature || undefined }),
    onSuccess: () => {
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
          <h2 className="font-semibold text-gray-900">{readOnly ? 'Spot check' : 'New carer spot check'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Carer *</label>
              {readOnly ? (
                <p className="text-sm text-gray-800">{existing ? `${existing.carer?.firstName} ${existing.carer?.lastName}` : '—'}</p>
              ) : (
                <select value={carerId} onChange={(e) => setCarerId(e.target.value)} className="input">
                  <option value="">Select carer</option>
                  {carers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="label">Service user / visit</label>
              {readOnly ? (
                <p className="text-sm text-gray-800">{existing?.serviceUser ? `${existing.serviceUser.firstName} ${existing.serviceUser.lastName}` : '—'}</p>
              ) : (
                <select value={serviceUserId} onChange={(e) => setServiceUserId(e.target.value)} className="input">
                  <option value="">Not specified</option>
                  {serviceUsers.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
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
              <textarea value={generalComments} rows={3} onChange={(e) => setGeneralComments(e.target.value)} className="input resize-none text-sm" placeholder="Appearance, footwear, jewellery, nails, attitude, communication skills, etc." />
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
              <SignaturePad value={readOnly ? (existing?.observerSignature || '') : observerSignature} ro={readOnly} onChange={setObserverSignature} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-3 border-t">
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
