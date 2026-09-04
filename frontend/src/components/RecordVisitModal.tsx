import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clockApi } from '../api/clock';
import { callLogsApi } from '../api/callLogs';
import { Shift } from '../types';
import { formatTime12h } from '../lib/time';
import { format } from 'date-fns';
import MarChartModal from './MarChartModal';
import AutoGrowTextarea from './AutoGrowTextarea';

function toInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function schedStart(s: Shift): Date {
  const b = new Date(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  return new Date(b.getFullYear(), b.getMonth(), b.getDate(), h, m, 0);
}
function schedEnd(s: Shift): Date {
  const b = new Date(s.date);
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  const e = new Date(b.getFullYear(), b.getMonth(), b.getDate(), eh, em, 0);
  if (eh * 60 + em <= sh * 60 + sm) e.setDate(e.getDate() + 1);
  return e;
}

interface Props {
  shift: Shift;
  carer: { id: string; name: string };
  onClose: () => void;
  onSaved?: () => void;
}

// Office backfill of a missed visit — the carer did the call but couldn't submit
// (no signal). Record their clock in/out and the call log here; medication is
// recorded via the MAR chart. Everything is attributed to the carer and audited.
export default function RecordVisitModal({ shift, carer, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const [clockIn, setClockIn] = useState(toInput(schedStart(shift)));
  const [clockOut, setClockOut] = useState(toInput(schedEnd(shift)));
  const [note, setNote] = useState('');
  const [marOpen, setMarOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      await clockApi.createRecord({
        shiftId: shift.id,
        userId: carer.id,
        clockIn: new Date(clockIn).toISOString(),
        clockOut: clockOut ? new Date(clockOut).toISOString() : undefined,
      });
      if (note.trim() && shift.serviceUserId) {
        await callLogsApi.createManage({ serviceUserId: shift.serviceUserId, shiftId: shift.id, note: note.trim(), asUserId: carer.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-records'] });
      qc.invalidateQueries({ queryKey: ['shifts', 'attendance'] });
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      onSaved?.();
      onClose();
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save. Please try again.'),
  });

  // Meds are recorded on the client's MAR chart — show it in place, then return.
  if (marOpen && shift.serviceUser) {
    return <MarChartModal serviceUser={shift.serviceUser} onClose={() => setMarOpen(false)} />;
  }

  const su = shift.serviceUser;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Record missed visit</h2>
          <p className="text-sm text-gray-500">
            {su ? `${su.firstName} ${su.lastName}` : 'Visit'} · {shift.visitName ? `${shift.visitName} · ` : ''}{formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{format(schedStart(shift), 'EEE dd MMM yyyy')} · carer: {carer.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Clock in</label>
            <input type="datetime-local" value={clockIn} max={toInput(new Date())} onChange={(e) => setClockIn(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Clock out</label>
            <input type="datetime-local" value={clockOut} max={toInput(new Date())} onChange={(e) => setClockOut(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Call log</label>
          <AutoGrowTextarea value={note} onChange={(e) => setNote(e.target.value)} minRows={3} className="input" placeholder="What the carer did on this visit… (entered by office — carer had no signal)" />
        </div>

        <button type="button" onClick={() => setMarOpen(true)} className="btn-secondary btn w-full" disabled={!su}>
          💊 Record medication (MAR chart)
        </button>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary btn">Cancel</button>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !clockIn} className="btn-primary btn">
            {save.isPending ? 'Saving…' : 'Save visit'}
          </button>
        </div>
      </div>
    </div>
  );
}
