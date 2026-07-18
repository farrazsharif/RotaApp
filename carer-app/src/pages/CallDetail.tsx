import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isToday, format } from 'date-fns';
import Layout from '../components/Layout';
import { shiftDetailApi } from '../api/shiftDetail';
import { clockApi } from '../api/clock';
import { callLogsApi } from '../api/callLogs';
import { medicationsApi } from '../api/medications';
import { handoversApi } from '../api/handovers';
import { useAuth } from '../contexts/AuthContext';
import { isCallDone } from '../lib/shiftStatus';
import { formatTime12h } from '../lib/time';
import type { MedAdminStatus, CallLogSignature, ClockRecord } from '../types';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Ticks every second while clocked in, so the carer can see time-on-shift
// accumulate live rather than only finding out the total after clocking out.
function LiveShiftTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = now - new Date(since).getTime();
  return (
    <div className="text-center py-1">
      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Time on Shift</p>
      <p className="text-3xl font-bold text-green-700 tabular-nums">{formatElapsed(elapsed)}</p>
    </div>
  );
}

// Lets a carer correct the actual start (and, once clocked out, end) time on
// their own record — for when they did the visit but forgot to clock in/out and
// recorded it late, which would otherwise show the wrong duration. One tap fills
// the scheduled time; a manual time is also allowed.
function AdjustTimes({ record, scheduledStart, scheduledEnd, onSaved }: { record: ClockRecord; scheduledStart: string; scheduledEnd: string; onSaved: () => void }) {
  const hasOut = !!record.clockOut;
  const [open, setOpen] = useState(false);
  const [startVal, setStartVal] = useState(() => format(new Date(record.clockIn), 'HH:mm'));
  const [endVal, setEndVal] = useState(() => (record.clockOut ? format(new Date(record.clockOut), 'HH:mm') : ''));
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: { startTime?: string; endTime?: string }) => clockApi.setTimes(record.id, body),
    onSuccess: () => { setOpen(false); setErr(null); onSaved(); },
    onError: (e: any) => setErr(e.response?.data?.error || 'Could not update the times.'),
  });

  function toIso(hhmm: string, ref: string): string {
    const base = new Date(ref);
    const [h, m] = hhmm.split(':').map(Number);
    base.setHours(h || 0, m || 0, 0, 0);
    return base.toISOString();
  }

  function save() {
    const body: { startTime?: string; endTime?: string } = {};
    if (startVal) body.startTime = toIso(startVal, record.clockIn);
    if (hasOut && endVal) body.endTime = toIso(endVal, record.clockOut!);
    if (!body.startTime && !body.endTime) return;
    mut.mutate(body);
  }

  function openEditor() {
    setStartVal(format(new Date(record.clockIn), 'HH:mm'));
    setEndVal(record.clockOut ? format(new Date(record.clockOut), 'HH:mm') : '');
    setErr(null);
    setOpen(true);
  }

  if (!open) {
    return (
      <button onClick={openEditor} className="mt-2 text-sm font-medium text-blue-600">
        🕑 {hasOut ? 'Fix visit times' : 'Forgot to clock in? Adjust start time'}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 text-left space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">When did you actually start?</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="time" value={startVal} onChange={(e) => setStartVal(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button onClick={() => setStartVal(scheduledStart)} className="text-sm font-medium text-blue-600">Use {formatTime12h(scheduledStart)}</button>
        </div>
      </div>
      {hasOut && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">When did you actually finish?</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="time" value={endVal} onChange={(e) => setEndVal(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button onClick={() => setEndVal(scheduledEnd)} className="text-sm font-medium text-blue-600">Use {formatTime12h(scheduledEnd)}</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={mut.isPending} className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 font-bold text-sm disabled:opacity-40">
          {mut.isPending ? 'Saving…' : hasOut ? 'Save times' : 'Save start time'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-xl border border-gray-300 px-4 py-2.5 font-semibold text-gray-700 text-sm">Cancel</button>
      </div>
    </div>
  );
}

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
  const [showHandover, setShowHandover] = useState(false);
  const [handoverTo, setHandoverTo] = useState('');
  const [handoverReason, setHandoverReason] = useState('');
  const [editingLog, setEditingLog] = useState(false);

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

  const clockedIn = !!clockStatus?.clockedIn && clockStatus.record?.shiftId === shift?.id;

  const { data: callLogs = [] } = useQuery({
    queryKey: ['call-logs', shift?.serviceUserId],
    queryFn: () => callLogsApi.list(shift!.serviceUserId!),
    enabled: !!shift?.serviceUserId,
  });

  // Shared call log: one log per visit that every carer on the call signs.
  const sharedLog = callLogs.find((l) => l.shiftId === shift?.id);
  const signatures: CallLogSignature[] = (() => {
    if (!sharedLog?.signedBy) return [];
    try { const v = JSON.parse(sharedLog.signedBy); return Array.isArray(v) ? v : []; } catch { return []; }
  })();
  const carerCount = shift?.cover && shift.cover > 1 ? shift.cover : 1;
  const isSharedCall = carerCount > 1;
  const iSigned = !!sharedLog && (sharedLog.userId === user?.id || signatures.some((s) => s.userId === user?.id));
  // A carer can clock out once they've written or signed this visit's log.
  const hasLoggedThisVisit = clockedIn && iSigned;

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
      setClockOutError(null);
      setEditingLog(false);
      qc.invalidateQueries({ queryKey: ['call-logs', shift?.serviceUserId] });
      setTimeout(() => setLogSent(false), 2000);
    },
  });

  // Co-carer signs the shared log the first carer wrote (no retyping).
  const signMut = useMutation({
    mutationFn: (logId: string) => callLogsApi.sign(logId),
    onSuccess: () => {
      setClockOutError(null);
      qc.invalidateQueries({ queryKey: ['call-logs', shift?.serviceUserId] });
    },
  });

  // --- Handover (ask another carer to cover this call) ---
  const { data: myHandovers } = useQuery({
    queryKey: ['my-handovers'],
    queryFn: handoversApi.mine,
    refetchInterval: 60000,
  });
  const outgoing = myHandovers?.outgoing.find((h) => h.shiftId === id);

  const { data: eligible = [] } = useQuery({
    queryKey: ['handover-eligible', id],
    queryFn: () => handoversApi.eligible(id!),
    enabled: showHandover && !!id,
  });

  const requestHandoverMut = useMutation({
    mutationFn: () => handoversApi.request(id!, handoverTo, handoverReason.trim()),
    onSuccess: () => {
      setShowHandover(false);
      setHandoverTo('');
      setHandoverReason('');
      qc.invalidateQueries({ queryKey: ['my-handovers'] });
    },
  });

  const cancelHandoverMut = useMutation({
    mutationFn: (hid: string) => handoversApi.cancel(hid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-handovers'] }),
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
  const clockedInElsewhere = !!clockStatus?.clockedIn && clockStatus.record?.shiftId !== shift.id;
  const done = isCallDone(shift, user?.id);
  const shiftIsToday = isToday(new Date(shift.date));
  const myCompletedRecord = shift.clockRecords?.find((r) => r.userId === user?.id && r.clockOut);
  const totalTimeSpent = myCompletedRecord
    ? formatElapsed(new Date(myCompletedRecord.clockOut!).getTime() - new Date(myCompletedRecord.clockIn).getTime())
    : null;

  return (
    <Layout title={name}>
      <div className="space-y-4">
        <div className={`rounded-2xl p-4 shadow-sm border ${done ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}</p>
            {done && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Visit Completed</span>}
          </div>
          {shift.visitName && <p className="font-semibold text-gray-800">{shift.visitName}</p>}
          {su?.address && <p className="text-sm text-gray-500 mt-1">📍 {su.address}{su.postcode ? `, ${su.postcode}` : ''}</p>}
          {su?.phone && <p className="text-sm text-gray-500">📞 {su.phone}</p>}
          {su && (
            <button
              onClick={() => navigate(`/client/${su.id}`)}
              className="mt-2 text-sm font-medium text-blue-600"
            >
              📋 View Client Details
            </button>
          )}
        </div>

        {/* Clock in/out */}
        {done ? (
          <div className="bg-green-50 border border-green-300 rounded-2xl p-4 text-center">
            <p className="text-sm font-semibold text-green-700">✓ This call is complete.</p>
            {totalTimeSpent && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Time Spent</p>
                <p className="text-2xl font-bold text-green-700 tabular-nums">{totalTimeSpent}</p>
              </div>
            )}
            {myCompletedRecord && isToday(new Date(myCompletedRecord.clockIn)) && (
              <AdjustTimes
                record={myCompletedRecord}
                scheduledStart={shift.startTime}
                scheduledEnd={shift.endTime}
                onSaved={() => qc.invalidateQueries({ queryKey: ['shift', id] })}
              />
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            {clockedIn && clockStatus?.record && <LiveShiftTimer since={clockStatus.record.clockIn} />}
            {clockedIn && clockStatus?.record && (
              <div className="text-center">
                <AdjustTimes
                  record={clockStatus.record}
                  scheduledStart={shift.startTime}
                  scheduledEnd={shift.endTime}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['clock-status'] })}
                />
              </div>
            )}
            {clockedInElsewhere ? (
              <p className="text-sm text-orange-600 font-medium">You're clocked in on another call. Clock out there first.</p>
            ) : clockedIn ? (
              <>
                <button
                  onClick={() => clockOutMut.mutate()}
                  disabled={clockOutMut.isPending || !hasLoggedThisVisit}
                  className="w-full bg-red-600 text-white rounded-xl py-3.5 font-bold text-base disabled:opacity-50"
                >
                  {clockOutMut.isPending ? 'Clocking out…' : '⏹ Clock Out'}
                </button>
                {!hasLoggedThisVisit && (
                  <p className="text-xs text-orange-600 font-medium mt-2 text-center">
                    Write a call log entry below before you can clock out.
                  </p>
                )}
              </>
            ) : !shiftIsToday ? (
              <p className="text-sm text-gray-500 font-medium text-center py-1">
                You can only clock in to today's calls.
              </p>
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

        {/* Hand over this call to another carer */}
        {!done && !clockedIn && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            {outgoing && outgoing.status === 'PENDING' ? (
              <div>
                <p className="text-sm font-semibold text-amber-700">🤝 Cover requested</p>
                <p className="text-sm text-gray-600 mt-1">
                  Waiting for <span className="font-medium">{outgoing.toUser.firstName} {outgoing.toUser.lastName}</span> to accept.
                </p>
                <button
                  onClick={() => cancelHandoverMut.mutate(outgoing.id)}
                  disabled={cancelHandoverMut.isPending}
                  className="mt-2 text-sm font-medium text-red-600 disabled:opacity-50"
                >
                  Cancel request
                </button>
              </div>
            ) : outgoing && outgoing.status === 'ACCEPTED' ? (
              <p className="text-sm font-semibold text-green-700">
                ✓ {outgoing.toUser.firstName} {outgoing.toUser.lastName} is now covering this call.
              </p>
            ) : outgoing && outgoing.status === 'DECLINED' ? (
              <div>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{outgoing.toUser.firstName} {outgoing.toUser.lastName}</span> declined. You can ask someone else.
                </p>
                <button onClick={() => setShowHandover(true)} className="mt-2 text-sm font-semibold text-blue-600">
                  Ask another carer
                </button>
              </div>
            ) : !showHandover ? (
              <button onClick={() => setShowHandover(true)} className="w-full text-left">
                <p className="font-semibold text-gray-800">🤝 Hand over this call</p>
                <p className="text-sm text-gray-500 mt-0.5">Off sick or can't attend? Ask another carer to cover.</p>
              </button>
            ) : (
              <div>
                <p className="font-semibold text-gray-800 mb-2">Hand over this call</p>
                <label className="block text-sm text-gray-600 mb-1">Cover carer</label>
                <select
                  value={handoverTo}
                  onChange={(e) => setHandoverTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3"
                >
                  <option value="">Select a carer…</option>
                  {eligible.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
                <label className="block text-sm text-gray-600 mb-1">Reason (optional)</label>
                <textarea
                  value={handoverReason}
                  onChange={(e) => setHandoverReason(e.target.value)}
                  placeholder="e.g. off sick"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3"
                />
                {requestHandoverMut.isError && (
                  <p className="text-sm text-red-600 mb-2">
                    {(requestHandoverMut.error as any)?.response?.data?.error || 'Could not send request.'}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => requestHandoverMut.mutate()}
                    disabled={!handoverTo || requestHandoverMut.isPending}
                    className="flex-1 rounded-xl bg-blue-600 py-2.5 font-bold text-white disabled:opacity-40"
                  >
                    {requestHandoverMut.isPending ? 'Sending…' : 'Send request'}
                  </button>
                  <button
                    onClick={() => { setShowHandover(false); setHandoverTo(''); setHandoverReason(''); }}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
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
                      <span className="text-xs text-gray-400">{formatTime12h(dose.time)}</span>
                    </div>
                    {dose.status ? (
                      <p className="text-sm font-semibold text-green-600 mt-2">
                        ✓ {dose.status.replace('_', ' ')}
                        {dose.recordedAt && <span className="text-gray-400 font-normal"> at {format(new Date(dose.recordedAt), 'h:mm a')}</span>}
                      </p>
                    ) : (
                      <select
                        defaultValue=""
                        disabled={medMut.isPending}
                        onChange={(e) => {
                          const status = e.target.value as MedAdminStatus;
                          if (status) medMut.mutate({ medicationId: dose.medicationId, scheduledFor: dose.scheduledFor, status });
                        }}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                      >
                        <option value="" disabled>Mark as…</option>
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Call log */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <h2 className="font-semibold text-gray-800 mb-1 flex flex-wrap items-center gap-x-2">
            {isSharedCall ? 'Shared Call Log' : 'Call Log'}
            {clockedIn && !hasLoggedThisVisit && (
              <span className="text-orange-600 text-xs font-bold">· {sharedLog ? 'Sign before clocking out' : 'Required before clocking out'}</span>
            )}
          </h2>
          {isSharedCall && (
            <p className="text-xs text-gray-400 mb-2">This call has {carerCount} carers — one note is shared, and everyone signs it.</p>
          )}

          {(!sharedLog || editingLog) && !done ? (
            /* Write / edit the note */
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write a note about this visit…"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => logMut.mutate()}
                  disabled={!note.trim() || logMut.isPending}
                  className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40"
                >
                  {logMut.isPending ? 'Saving…' : logSent ? 'Saved ✓' : isSharedCall ? 'Save & Sign' : 'Save Note'}
                </button>
                {editingLog && (
                  <button
                    onClick={() => { setEditingLog(false); setNote(''); }}
                    className="rounded-xl border border-gray-300 px-4 py-2.5 font-semibold text-gray-700 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {isSharedCall && editingLog && (
                <p className="text-xs text-gray-400 mt-2">Changing the note asks the other carers to sign again.</p>
              )}
            </>
          ) : sharedLog ? (
            /* Read the shared note + sign */
            <>
              <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">{sharedLog.note}</p>

              {isSharedCall && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Signed by {signatures.length} of {carerCount}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {signatures.map((s) => (
                      <span key={s.userId} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {s.firstName} {s.lastName} ✓
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!done && (
                <>
                  <div className="mt-3 flex gap-2">
                    {!iSigned ? (
                      <button
                        onClick={() => signMut.mutate(sharedLog.id)}
                        disabled={signMut.isPending || !clockedIn}
                        className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 font-bold text-sm disabled:opacity-40"
                      >
                        {signMut.isPending ? 'Signing…' : 'Confirm & Sign'}
                      </button>
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-green-700 py-2.5">✓ You've signed this log</span>
                    )}
                    <button
                      onClick={() => { setEditingLog(true); setNote(sharedLog.note); }}
                      className="rounded-xl border border-gray-300 px-4 py-2.5 font-semibold text-gray-700 text-sm"
                    >
                      Edit note
                    </button>
                  </div>
                  {!iSigned && !clockedIn && (
                    <p className="text-xs text-gray-400 mt-2">Clock in to sign this log.</p>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No call log was recorded for this visit.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
