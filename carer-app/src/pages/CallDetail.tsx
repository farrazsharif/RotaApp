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
import { mapsUrl } from '../lib/maps';
import type { MedAdminStatus, CallLogSignature, ClockRecord, DueDose } from '../types';

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
function AdjustTimes({ record, scheduledStart, scheduledEnd, onSaved, forceOpen }: { record: ClockRecord; scheduledStart: string; scheduledEnd: string; onSaved: () => void; forceOpen?: boolean }) {
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

  // When the clock-out was blocked for being too short, open the editor so the
  // carer is taken straight to correcting their start time.
  useEffect(() => { if (forceOpen) openEditor(); /* eslint-disable-next-line */ }, [forceOpen]);

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
  { value: 'GIVEN', label: 'Administered', color: 'bg-green-600' },
  { value: 'REFUSED', label: 'Refused', color: 'bg-orange-500' },
  { value: 'NOT_NEEDED', label: 'Not Required', color: 'bg-gray-400' },
  { value: 'SELF_ADMIN', label: 'Self-Administered', color: 'bg-blue-500' },
  { value: 'MISSED', label: 'Absent', color: 'bg-red-600' },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [clockOutError, setClockOutError] = useState<{ message: string; pendingMeds: string[] } | null>(null);
  const [shortFix, setShortFix] = useState(false);
  const [logSent, setLogSent] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [handoverTo, setHandoverTo] = useState('');
  const [handoverReason, setHandoverReason] = useState('');
  const [editingLog, setEditingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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

  // The visit's doses (with recorded status), by shift — stays available after
  // the call is completed so the carer can review what was given.
  const { data: dueMeds = [] } = useQuery({
    queryKey: ['shift-meds', id],
    queryFn: () => clockApi.shiftMeds(id!),
    enabled: !!id,
    refetchInterval: () => (clockStatus?.clockedIn ? 15000 : false),
  });

  const clockedIn = !!clockStatus?.clockedIn && clockStatus.record?.shiftId === shift?.id;

  const { data: callLogs = [] } = useQuery({
    queryKey: ['call-logs', shift?.serviceUserId],
    queryFn: () => callLogsApi.list(shift!.serviceUserId!),
    enabled: !!shift?.serviceUserId,
  });

  // Shared call log: one log per visit that every carer on the call signs.
  const sharedLog = callLogs.find((l) => l.shiftId === shift?.id);

  // Recent visit history: the last 7 days of this client's logs from OTHER
  // visits, so the incoming carer can see what previous carers did and continue
  // from there. Read-only — each log stays attributed to whoever wrote it.
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const historyLogs = callLogs
    .filter((l) => l.shiftId !== shift?.id && l.note?.trim() && Date.now() - new Date(l.createdAt).getTime() <= WEEK_MS)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // Name(s) to credit a log to: its signers, else the author, else the recorded time.
  const logAuthors = (l: typeof callLogs[number]): string => {
    try {
      const sigs = l.signedBy ? JSON.parse(l.signedBy) : [];
      if (Array.isArray(sigs) && sigs.length) return sigs.map((s: CallLogSignature) => `${s.firstName} ${s.lastName}`.trim()).filter(Boolean).join(', ');
    } catch { /* fall through */ }
    return l.user ? `${l.user.firstName} ${l.user.lastName}`.trim() : '';
  };
  const signatures: CallLogSignature[] = (() => {
    if (!sharedLog?.signedBy) return [];
    try { const v = JSON.parse(sharedLog.signedBy); return Array.isArray(v) ? v : []; } catch { return []; }
  })();
  // A call is a "shared" (double/triple-up) log only when 2+ carers are actually
  // assigned to THIS shift — not merely because the cover target is set >1. This
  // keeps two separate single-carer visits (even overlapping ones, e.g. a 1-hour
  // Bed Call and a 10-hour Night Call at the same start) as independent logs, so
  // each carer writes and signs their own note.
  const assignedCarerCount = (shift?.userId ? 1 : 0) + (shift?.coverCarers?.length ?? 0);
  const carerCount = Math.max(assignedCarerCount, 1);
  const isSharedCall = carerCount > 1;
  const iSigned = !!sharedLog && (sharedLog.userId === user?.id || signatures.some((s) => s.userId === user?.id));
  // A carer can clock out once they've written or signed this visit's log.
  const hasLoggedThisVisit = clockedIn && iSigned;

  const clockInMut = useMutation({
    mutationFn: () => clockApi.clockIn(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['shift-meds', id] });
    },
  });

  const clockOutMut = useMutation({
    mutationFn: clockApi.clockOut,
    onSuccess: () => {
      setClockOutError(null);
      setShortFix(false);
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['my-calls'] });
      qc.invalidateQueries({ queryKey: ['shift', id] });
      navigate('/');
    },
    onError: (err: any) => {
      const data = err.response?.data;
      // SHORT_DURATION → show the reason and drop the carer into the start-time
      // editor; other blocks (meds/log) keep their existing messaging.
      setShortFix(data?.error === 'SHORT_DURATION');
      const message = data?.message || data?.error || 'Could not clock out.';
      setClockOutError({ message, pendingMeds: data?.pendingMeds || [] });
    },
  });

  // Doses the carer has ticked but not yet saved, keyed by dose. Nothing is
  // recorded until they tap "Save".
  const [picks, setPicks] = useState<Record<string, { medicationId: string; scheduledFor: string; status: MedAdminStatus }>>({});

  const saveAllMut = useMutation({
    mutationFn: () =>
      Promise.all(
        Object.values(picks).map((p) =>
          medicationsApi.recordAdministration({
            medicationId: p.medicationId,
            serviceUserId: shift!.serviceUserId!,
            scheduledFor: p.scheduledFor,
            status: p.status,
          }),
        ),
      ),
    onSuccess: () => { setPicks({}); qc.invalidateQueries({ queryKey: ['shift-meds', id] }); },
    onError: () => alert('Could not save the medication. Please try again.'),
  });

  // One dose card — used for both scheduled doses and as-required (PRN) meds.
  const renderDose = (dose: DueDose, interactive: boolean) => (
    <div key={`${dose.medicationId}-${dose.scheduledFor}`} className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-800 flex items-center gap-1.5 flex-wrap">
          {dose.name}{dose.dose ? ` · ${dose.dose}` : ''}
          {dose.isBlisterPack && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">💊 Pack</span>}
          {dose.prn && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">As required</span>}
        </p>
        <span className="text-xs text-gray-400 shrink-0">{dose.prn ? 'PRN' : formatTime12h(dose.time)}</span>
      </div>
      {dose.isBlisterPack && dose.packContents && (
        <div className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg p-2 whitespace-pre-wrap">
          <span className="font-medium text-gray-500">In this pack:</span>{'\n'}{dose.packContents}
        </div>
      )}
      {dose.status ? (
        <p className="text-sm font-semibold text-green-600 mt-2">
          ✓ {STATUS_LABEL[dose.status] || dose.status}
          {dose.recordedAt && <span className="text-gray-400 font-normal"> at {format(new Date(dose.recordedAt), 'h:mm a')}</span>}
        </p>
      ) : !interactive ? (
        <p className="text-sm font-medium text-gray-400 mt-2">Not recorded</p>
      ) : (() => {
        const key = `${dose.medicationId}__${dose.scheduledFor}`;
        const picked = picks[key]?.status;
        return (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const sel = picked === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPicks((p) => {
                    const n = { ...p };
                    if (sel) delete n[key];
                    else n[key] = { medicationId: dose.medicationId, scheduledFor: dose.scheduledFor, status: opt.value };
                    return n;
                  })}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm text-left transition-colors ${
                    sel ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-300 text-gray-700'
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[11px] border-2 shrink-0 ${
                    sel ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                  }`}>{sel ? '✓' : ''}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );

  const logMut = useMutation({
    mutationFn: () =>
      callLogsApi.create({ serviceUserId: shift!.serviceUserId!, shiftId: shift!.id, note: note.trim() }),
    onSuccess: () => {
      setNote('');
      setLogSent(true);
      setClockOutError(null);
      setEditingLog(false);
      setLogError(null);
      qc.invalidateQueries({ queryKey: ['call-logs', shift?.serviceUserId] });
      setTimeout(() => setLogSent(false), 2000);
    },
    onError: (err: any) => setLogError(err?.response?.data?.error || 'Could not save the note. Please try again.'),
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
  // Other carers on this same call (double/triple-up) — so the carer can see who
  // they're working alongside. Excludes themselves.
  const coCarers = [
    shift.user && shift.user.id !== user?.id ? shift.user : null,
    ...(shift.coverCarers ?? []).filter((c) => c.id !== user?.id),
  ].filter(Boolean) as { id: string; firstName: string; lastName: string }[];
  const clockedInElsewhere = !!clockStatus?.clockedIn && clockStatus.record?.shiftId !== shift.id;
  const done = isCallDone(shift, user?.id);
  const shiftIsToday = isToday(new Date(shift.date));
  // A carer can still amend this visit's log for a week after the visit — e.g.
  // to add a task they forgot — even once the call is done. Older records are
  // amended by a manager. Mirrors the backend edit window.
  const withinLogEditWindow = Date.now() - new Date(shift.date).getTime() < 7 * 24 * 60 * 60 * 1000;
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
          {coCarers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">👥 Working with</span>
              {coCarers.map((c) => (
                <span key={c.id} className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  {c.firstName} {c.lastName}
                </span>
              ))}
            </div>
          )}
          {su?.address && (
            <p className="text-sm mt-1">
              <a
                href={mapsUrl(su.address, su.postcode) || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 active:text-blue-800"
              >
                📍 {su.address}{su.postcode ? `, ${su.postcode}` : ''}
              </a>
            </p>
          )}
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
                  forceOpen={shortFix}
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

        {/* Medication — interactive while on the call; read-only afterwards so
            the carer can check what was given. */}
        {(clockedIn || (done && dueMeds.length > 0)) && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <h2 className="font-semibold text-gray-800 mb-1">{done ? 'Medication record' : 'Medication Due'}</h2>
            {done && dueMeds.length > 0 && <p className="text-xs text-gray-400 mb-2">What was given on this visit.</p>}
            {dueMeds.length === 0 ? (
              <p className="text-sm text-gray-400">No medication due for this visit.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {dueMeds.filter((d) => !d.prn).map((d) => renderDose(d, clockedIn && !done))}
                  {dueMeds.some((d) => d.prn) && (
                    <div className="pt-1">
                      <p className="text-xs font-semibold text-gray-500 mb-2">As required (PRN){clockedIn && !done ? ' — record only if given' : ''}</p>
                      <div className="space-y-3">
                        {dueMeds.filter((d) => d.prn).map((d) => renderDose(d, clockedIn && !done))}
                      </div>
                    </div>
                  )}
                </div>
                {Object.keys(picks).length > 0 && (
                  <button
                    onClick={() => saveAllMut.mutate()}
                    disabled={saveAllMut.isPending}
                    className="mt-3 w-full rounded-xl bg-blue-600 text-white font-semibold py-2.5 disabled:opacity-50"
                  >
                    {saveAllMut.isPending ? 'Saving…' : `Save ${Object.keys(picks).length} medication${Object.keys(picks).length > 1 ? 's' : ''}`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Recent visit history — last 7 days of other visits' logs, read-only,
            so the carer can see what happened before and continue from there. */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="font-semibold text-gray-800">
              📖 Recent visit history
              <span className="text-gray-400 font-normal text-sm"> · last 7 days</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{historyLogs.length}</span>
              <span className={`text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}>▾</span>
            </span>
          </button>
          {showHistory && (
            <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
              {historyLogs.length === 0 ? (
                <p className="text-sm text-gray-400">No visits logged in the last 7 days.</p>
              ) : (
                historyLogs.map((l) => {
                  const authors = logAuthors(l);
                  const when = l.shift?.date ? new Date(l.shift.date) : new Date(l.createdAt);
                  const timeLabel = l.shift ? `${formatTime12h(l.shift.startTime)}` : format(new Date(l.createdAt), 'h:mm a');
                  return (
                    <div key={l.id} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-700">
                          {format(when, 'EEE d MMM')} · {timeLabel}
                          {l.shift?.visitName ? ` · ${l.shift.visitName}` : ''}
                        </span>
                        {authors && <span className="text-xs text-gray-400 shrink-0">{authors}</span>}
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{l.note}</p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

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

          {(!sharedLog && !done) || editingLog ? (
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
                    onClick={() => { setEditingLog(false); setNote(''); setLogError(null); }}
                    className="rounded-xl border border-gray-300 px-4 py-2.5 font-semibold text-gray-700 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {isSharedCall && editingLog && (
                <p className="text-xs text-gray-400 mt-2">Changing the note asks the other carers to sign again.</p>
              )}
              {logError && <p className="text-xs text-red-600 mt-2">{logError}</p>}
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

              {/* After the visit is done, the carer can still amend the note for
                  a week — e.g. to add a task they forgot on the day. */}
              {done && withinLogEditWindow && (
                <div className="mt-3">
                  <button
                    onClick={() => { setEditingLog(true); setNote(sharedLog.note); setLogError(null); }}
                    className="text-sm font-semibold text-blue-600"
                  >
                    ✏️ Edit note / add a missed task
                  </button>
                </div>
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
