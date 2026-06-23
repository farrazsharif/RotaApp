import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { shiftDetailApi } from '../api/shiftDetail';
import { clockApi } from '../api/clock';
import { callLogsApi } from '../api/callLogs';
import { medicationsApi } from '../api/medications';
import { useAuth } from '../contexts/AuthContext';
import { isCallDone } from '../lib/shiftStatus';
import type { MedAdminStatus } from '../types';

const STATUS_OPTIONS: { value: MedAdminStatus; label: string; color: string }[] = [
  { value: 'GIVEN', label: 'Given', color: 'bg-green-600' },
  { value: 'REFUSED', label: 'Refused', color: 'bg-orange-500' },
  { value: 'NOT_NEEDED', label: 'Not Needed', color: 'bg-gray-400' },
  { value: 'SELF_ADMIN', label: 'Self-Administered', color: 'bg-blue-500' },
  { value: 'MISSED', label: 'Missed', color: 'bg-red-600' },
];

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [clockOutError, setClockOutError] = useState<{ message: string; pendingMeds: string[] } | null>(null);
  const [logSent, setLogSent] = useState(false);

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shift', id],
    queryFn: () => shiftDetailApi.get(id!),
    enabled: !!id,
  });

  const { data: clockStatus } = useQuery({
    queryKey: ['clock-status'],
    queryFn: clockApi.status,
    refetchInterval: 15000,
  });

  const { data: dueMeds = [] } = useQuery({
    queryKey: ['due-meds'],
    queryFn: clockApi.dueMeds,
    enabled: !!clockStatus?.clockedIn,
    refetchInterval: 15000,
  });

  const clockInMut = useMutation({
    mutationFn: () => clockApi.clockIn(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['due-meds'] });
    },
  });

  const clockOutMut = useMutation({
    mutationFn: clockApi.clockOut,
    onSuccess: () => {
      setClockOutError(null);
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['my-calls'] });
      qc.invalidateQueries({ queryKey: ['shift', id] });
      navigate('/');
    },
    onError: (err: any) => {
      const data = err.response?.data;
      if (data?.pendingMeds) {
        setClockOutError({ message: data.error, pendingMeds: data.pendingMeds });
      } else {
        setClockOutError({ message: data?.error || 'Could not clock out.', pendingMeds: [] });
      }
    },
  });

  const medMut = useMutation({
    mutationFn: (vars: { medicationId: string; scheduledFor: string; status: MedAdminStatus }) =>
      medicationsApi.recordAdministration({
        medicationId: vars.medicationId,
        serviceUserId: shift!.serviceUserId!,
        scheduledFor: vars.scheduledFor,
        status: vars.status,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['due-meds'] }),
  });

  const logMut = useMutation({
    mutationFn: () =>
      callLogsApi.create({ serviceUserId: shift!.serviceUserId!, shiftId: shift!.id, note: note.trim() }),
    onSuccess: () => {
      setNote('');
      setLogSent(true);
      setTimeout(() => setLogSent(false), 2000);
    },
  });

  if (isLoading || !shift) {
    return (
      <Layout title="Call">
        <p className="text-center text-gray-400 py-8">Loading…</p>
      </Layout>
    );
  }

  const su = shift.serviceUser;
  const name = su ? `${su.firstName} ${su.lastName}` : 'Service user';
  const clockedIn = !!clockStatus?.clockedIn && clockStatus.record?.shiftId === shift.id;
  const clockedInElsewhere = !!clockStatus?.clockedIn && clockStatus.record?.shiftId !== shift.id;
  const done = isCallDone(shift, user?.id);

  return (
    <Layout title={name}>
      <div className="space-y-4">
        <div className={`rounded-2xl p-4 shadow-sm border ${done ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{shift.startTime}–{shift.endTime}</p>
            {done && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Visit Completed</span>}
          </div>
          {shift.visitName && <p className="font-semibold text-gray-800">{shift.visitName}</p>}
          {su?.address && <p className="text-sm text-gray-500 mt-1">📍 {su.address}{su.postcode ? `, ${su.postcode}` : ''}</p>}
          {su?.phone && <p className="text-sm text-gray-500">📞 {su.phone}</p>}
        </div>

        {/* Clock in/out */}
        {done ? (
          <div className="bg-green-50 border border-green-300 rounded-2xl p-4 text-center">
            <p className="text-sm font-semibold text-green-700">✓ This call is complete. No further changes can be made.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            {clockedInElsewhere ? (
              <p className="text-sm text-orange-600 font-medium">You're clocked in on another call. Clock out there first.</p>
            ) : clockedIn ? (
              <button
                onClick={() => clockOutMut.mutate()}
                disabled={clockOutMut.isPending}
                className="w-full bg-red-600 text-white rounded-xl py-3.5 font-bold text-base disabled:opacity-50"
              >
                {clockOutMut.isPending ? 'Clocking out…' : '⏹ Clock Out'}
              </button>
            ) : (
              <button
                onClick={() => clockInMut.mutate()}
                disabled={clockInMut.isPending}
                className="w-full bg-green-600 text-white rounded-xl py-3.5 font-bold text-base disabled:opacity-50"
              >
                {clockInMut.isPending ? 'Clocking in…' : '▶ Clock In'}
              </button>
            )}
            {clockOutError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 font-medium">{clockOutError.message}</p>
                {clockOutError.pendingMeds.length > 0 && (
                  <ul className="text-sm text-red-600 mt-1 list-disc list-inside">
                    {clockOutError.pendingMeds.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Medication */}
        {!done && clockedIn && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <h2 className="font-semibold text-gray-800 mb-2">Medication Due</h2>
            {dueMeds.length === 0 ? (
              <p className="text-sm text-gray-400">No medication due for this visit.</p>
            ) : (
              <div className="space-y-3">
                {dueMeds.map((dose) => (
                  <div key={`${dose.medicationId}-${dose.scheduledFor}`} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-800">{dose.name}{dose.dose ? ` · ${dose.dose}` : ''}</p>
                      <span className="text-xs text-gray-400">{dose.time}</span>
                    </div>
                    {dose.status ? (
                      <p className="text-sm font-semibold text-green-600 mt-2">✓ {dose.status.replace('_', ' ')}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => medMut.mutate({ medicationId: dose.medicationId, scheduledFor: dose.scheduledFor, status: opt.value })}
                            disabled={medMut.isPending}
                            className={`${opt.color} text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-50`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Call log */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <h2 className="font-semibold text-gray-800 mb-2">Call Log</h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={done ? 'This call is locked — no further notes can be added.' : 'Write a note about this visit…'}
            rows={3}
            disabled={done}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={() => logMut.mutate()}
            disabled={done || !note.trim() || logMut.isPending}
            className="mt-2 w-full bg-blue-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40"
          >
            {logMut.isPending ? 'Saving…' : logSent ? 'Saved ✓' : 'Save Note'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
