import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clockApi } from '../api/clock';
import { callLogsApi } from '../api/callLogs';
import { medicationsApi } from '../api/medications';
import { MedStatus } from '../types';
import { formatDistanceToNow } from 'date-fns';

const MED_OPTS: { value: MedStatus | ''; label: string }[] = [
  { value: '', label: '— mark dose' },
  { value: 'GIVEN', label: 'Given' },
  { value: 'REFUSED', label: 'Refused' },
  { value: 'MISSED', label: 'Missed' },
  { value: 'NOT_NEEDED', label: 'Not needed' },
  { value: 'SELF_ADMIN', label: 'Self-admin' },
];

export default function ClockWidget() {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [logNote, setLogNote] = useState('');

  const { data } = useQuery({
    queryKey: ['clock-status'],
    queryFn: clockApi.status,
    refetchInterval: 60_000,
  });

  const { data: calls = [] } = useQuery({
    queryKey: ['my-calls'],
    queryFn: () => clockApi.myCalls(),
    enabled: pickerOpen,
  });

  const { data: dueMeds } = useQuery({
    queryKey: ['due-meds'],
    queryFn: () => clockApi.dueMeds(),
    enabled: outOpen,
  });
  const doses = dueMeds?.doses ?? [];
  const pendingMeds = doses.filter((d) => !d.status).length;

  const recordMedMut = useMutation({
    mutationFn: (v: { medicationId: string; serviceUserId: string; scheduledFor: string; status: MedStatus }) =>
      medicationsApi.record(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['due-meds'] }),
  });

  const clockInMut = useMutation({
    mutationFn: (shiftId?: string) => clockApi.clockIn(shiftId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clock-status'] }); setError(''); setPickerOpen(false); },
    onError: (e: unknown) => setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'Error'),
  });

  const clockOutMut = useMutation({
    mutationFn: async () => {
      const rec = data?.record;
      const su = rec?.shift?.serviceUser;
      if (logNote.trim() && su) {
        await callLogsApi.create({ serviceUserId: su.id, shiftId: rec?.shiftId, note: logNote.trim() });
      }
      await clockApi.clockOut();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      setError(''); setOutOpen(false); setLogNote('');
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'Error'),
  });

  const isClockedIn = data?.clockedIn;
  const rec = data?.record;
  const patient = rec?.shift?.serviceUser;
  const since = rec?.clockIn ? formatDistanceToNow(new Date(rec.clockIn), { addSuffix: false }) : null;

  return (
    <div className="relative flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      {isClockedIn && (
        <span className="hidden sm:flex flex-col items-end leading-tight">
          {patient && <span className="text-xs font-medium text-gray-700">{patient.firstName} {patient.lastName}</span>}
          {since && <span className="text-[11px] text-green-600">⏱ {since}</span>}
        </span>
      )}

      {isClockedIn ? (
        <button onClick={() => setOutOpen(true)} className="btn btn-sm btn-danger">Clock Out</button>
      ) : (
        <button onClick={() => { setPickerOpen(true); setError(''); }} className="btn btn-sm btn-success">Clock In</button>
      )}

      {/* Clock-in: pick which call/patient */}
      {pickerOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border z-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Clock in to a call</p>
            <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <p className="text-xs text-gray-500">Today's calls, in order of time</p>
          <div className="max-h-72 overflow-y-auto divide-y">
            {calls.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">No calls scheduled for you today</p>}
            {calls.map((c) => (
              <button
                key={c.id}
                onClick={() => clockInMut.mutate(c.id)}
                disabled={clockInMut.isPending}
                className="w-full text-left py-2 px-1 hover:bg-gray-50 rounded"
              >
                <p className="text-sm font-medium text-gray-800">
                  {c.serviceUser ? `${c.serviceUser.firstName} ${c.serviceUser.lastName}` : 'No patient'}
                </p>
                <p className="text-xs text-gray-500">
                  <span className="font-semibold">{c.startTime}–{c.endTime}</span>
                  {c.visitName ? ` · ${c.visitName}` : ''}
                  {c.serviceUser?.postcode ? ` · ${c.serviceUser.postcode}` : ''}
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={() => clockInMut.mutate(undefined)}
            disabled={clockInMut.isPending}
            className="w-full btn btn-sm btn-secondary"
          >
            Clock in without a call
          </button>
        </div>
      )}

      {/* Clock-out: write a call log */}
      {outOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border z-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Clock out</p>
            <button onClick={() => { setOutOpen(false); setLogNote(''); }} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          {doses.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
              <p className="text-xs font-semibold text-amber-800">
                Medication due {pendingMeds > 0 ? `· ${pendingMeds} to record` : '· all recorded ✓'}
              </p>
              {doses.map((d) => (
                <div key={d.medicationId + d.scheduledFor} className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 flex-1 truncate">
                    {d.time} {d.name}{d.dose ? ` ${d.dose}` : ''}
                  </span>
                  <select
                    value={d.status || ''}
                    onChange={(e) => patient && recordMedMut.mutate({ medicationId: d.medicationId, serviceUserId: patient.id, scheduledFor: d.scheduledFor, status: e.target.value as MedStatus })}
                    className={`text-xs rounded-md border px-1.5 py-1 ${d.status ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-amber-300 text-gray-500'}`}
                  >
                    {MED_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {patient ? (
            <p className="text-xs text-gray-500">Call log for {patient.firstName} {patient.lastName}</p>
          ) : (
            <p className="text-xs text-gray-400">No patient on this clock-in — log won't be saved.</p>
          )}
          <textarea
            value={logNote}
            onChange={(e) => setLogNote(e.target.value)}
            rows={4}
            placeholder="What happened during the visit? (optional)"
            className="input resize-none text-sm"
            disabled={!patient}
          />
          <div className="flex gap-2">
            <button onClick={() => { setOutOpen(false); setLogNote(''); }} className="btn btn-sm btn-secondary flex-1">Cancel</button>
            <button onClick={() => clockOutMut.mutate()} disabled={clockOutMut.isPending || pendingMeds > 0} className="btn btn-sm btn-danger flex-1">
              {clockOutMut.isPending ? 'Saving…' : pendingMeds > 0 ? `Record ${pendingMeds} med${pendingMeds > 1 ? 's' : ''}` : 'Clock Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
