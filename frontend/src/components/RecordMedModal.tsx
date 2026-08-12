import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { medicationsApi } from '../api/medications';
import { usersApi } from '../api/users';
import { MedAdministration, MedStatus } from '../types';
import { formatTime12h } from '../lib/time';
import { format } from 'date-fns';

const STATUSES: { v: MedStatus; label: string }[] = [
  { v: 'GIVEN', label: 'Administered' },
  { v: 'SELF_ADMIN', label: 'Self-administered' },
  { v: 'REFUSED', label: 'Refused' },
  { v: 'MISSED', label: 'Absent' },
  { v: 'NOT_NEEDED', label: 'Not Required' },
  { v: 'CANCELLED', label: 'Cancelled (visit not made)' },
];

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  serviceUser: { id: string; firstName: string; lastName: string };
  medication: { id: string; name: string; dose?: string | null };
  scheduledFor: string;               // ISO of the dose slot
  existing?: MedAdministration | null; // record being edited, if any
  onClose: () => void;
  onSaved?: () => void;
}

// Office record/correction of a medication dose — used when a carer was offline
// and their entry never synced, or to fix a wrong one. Lets the office set the
// status, which carer gave it, the time given, and a note; every save is audited.
export default function RecordMedModal({ serviceUser, medication, scheduledFor, existing, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<MedStatus>(existing?.status ?? 'GIVEN');
  const [carerId, setCarerId] = useState<string>(existing?.userId ?? '');
  const [givenAt, setGivenAt] = useState<string>(
    existing?.recordedAt ? toLocalInput(new Date(existing.recordedAt)) : scheduledFor.slice(0, 16),
  );
  const [note, setNote] = useState<string>(existing?.note ?? '');
  const [err, setErr] = useState<string | null>(null);

  const { data: carers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const save = useMutation({
    mutationFn: () => medicationsApi.recordManage({
      medicationId: medication.id,
      serviceUserId: serviceUser.id,
      scheduledFor,
      status,
      note: note.trim() || undefined,
      userId: carerId || null,
      recordedAt: givenAt ? new Date(givenAt).toISOString() : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['med-admin'] });
      qc.invalidateQueries({ queryKey: ['med-admin-range', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['missed-meds'] });
      onSaved?.();
      onClose();
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save. Please try again.'),
  });

  const doseTime = format(new Date(scheduledFor), 'dd MMM yyyy');
  const doseClock = formatTime12h(scheduledFor.slice(11, 16));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{existing ? 'Edit medication record' : 'Record medication'}</h2>
          <p className="text-sm text-gray-500">
            {serviceUser.firstName} {serviceUser.lastName} · {medication.name}{medication.dose ? ` · ${medication.dose}` : ''}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Scheduled {doseTime} at {doseClock}</p>
        </div>

        <div>
          <label className="label">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as MedStatus)} className="input">
            {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Given by (carer)</label>
          <select value={carerId} onChange={(e) => setCarerId(e.target.value)} className="input">
            <option value="">— Not attributed —</option>
            {[...carers].sort((a, b) => a.firstName.localeCompare(b.firstName)).map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Time given</label>
          <input type="datetime-local" value={givenAt} onChange={(e) => setGivenAt(e.target.value)} className="input" />
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-none" placeholder="e.g. entered by office — carer had no signal" />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary btn">Cancel</button>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary btn">
            {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Record dose'}
          </button>
        </div>
      </div>
    </div>
  );
}
