import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { shiftsApi } from '../api/shifts';
import { clockApi } from '../api/clock';
import { callLogsApi } from '../api/callLogs';
import { supportLogApi } from '../api/supportLog';
import { formatTime12h } from '../lib/time';
import { parseCallLogTicks } from '../lib/callLogTasks';
import { domainLabel } from '../lib/supportDomains';
import { MedStatus, CallLogSignature } from '../types';

interface Props {
  shiftId: string;
  // The carer whose row was clicked, so their clock-in/out is highlighted on a
  // double/triple-up visit where several carers attended.
  focusCarerId?: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<MedStatus, string> = {
  GIVEN: 'Given',
  REFUSED: 'Refused',
  MISSED: 'Missed',
  NOT_NEEDED: 'Not required',
  SELF_ADMIN: 'Self-administered',
  CANCELLED: 'Cancelled',
};
const STATUS_CLASS: Record<MedStatus, string> = {
  GIVEN: 'text-green-700 bg-green-50',
  REFUSED: 'text-amber-700 bg-amber-50',
  MISSED: 'text-red-700 bg-red-50',
  NOT_NEEDED: 'text-gray-600 bg-gray-50',
  SELF_ADMIN: 'text-blue-700 bg-blue-50',
  CANCELLED: 'text-gray-600 bg-gray-50',
};

// The clock records the /shifts/:id endpoint returns (not on the base Shift type).
type ClockRec = { id: string; userId: string; clockIn: string; clockOut?: string };

function fmtDuration(clockIn: string, clockOut?: string): string {
  if (!clockOut) return 'In progress';
  const mins = Math.round((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function ShiftDetailDrawer({ shiftId, focusCarerId, onClose }: Props) {
  // Animate the panel in on mount and close on Escape.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 10);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const { data: shift, isLoading: shiftLoading } = useQuery({
    queryKey: ['shift-detail', shiftId],
    queryFn: () => shiftsApi.get(shiftId),
  });

  const { data: doses = [], isLoading: dosesLoading } = useQuery({
    queryKey: ['shift-meds', shiftId],
    queryFn: () => clockApi.shiftMeds(shiftId),
  });

  const serviceUserId = shift?.serviceUserId;
  const { data: allLogs = [] } = useQuery({
    queryKey: ['call-logs', serviceUserId],
    queryFn: () => callLogsApi.list(serviceUserId!),
    enabled: !!serviceUserId,
  });
  // Only this visit's log(s) — the endpoint returns the client's whole history.
  const logs = allLogs.filter((l) => l.shift?.id === shiftId);

  const isSL = (shift?.serviceUser as { careType?: string } | undefined)?.careType === 'SUPPORTED_LIVING';
  const { data: supportEntries = [] } = useQuery({
    queryKey: ['support-log-shift', shiftId],
    queryFn: () => supportLogApi.listByShift(shiftId),
    enabled: !!shift && isSL,
  });

  const clockRecords: ClockRec[] = ((shift as { clockRecords?: ClockRec[] } | undefined)?.clockRecords) ?? [];
  const carerName = (uid: string): string => {
    if (shift?.user && shift.user.id === uid) return `${shift.user.firstName} ${shift.user.lastName}`;
    const cc = shift?.coverCarers?.find((c) => c.id === uid);
    return cc ? `${cc.firstName} ${cc.lastName}` : 'Carer';
  };

  const su = shift?.serviceUser;
  const carers = shift ? [shift.user, ...(shift.coverCarers ?? [])].filter(Boolean) as { id: string; firstName: string; lastName: string }[] : [];

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {su ? `${su.firstName} ${su.lastName}` : 'Visit details'}
            </h2>
            {shift && (
              <p className="text-sm text-gray-500 mt-0.5">
                {format(new Date(shift.date), 'EEE dd MMM yyyy')}
                {shift.visitName ? ` · ${shift.visitName}` : ''} · {formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none -mt-1">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {shiftLoading ? (
            <div className="flex justify-center py-10"><div className="animate-spin h-7 w-7 border-b-2 border-blue-600 rounded-full" /></div>
          ) : !shift ? (
            <p className="text-sm text-gray-400">Could not load this visit.</p>
          ) : (
            <>
              {/* Patient / address */}
              {su && (su.address || su.postcode) && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Patient</h3>
                  <p className="text-sm text-gray-800">{su.firstName} {su.lastName}</p>
                  {(su.address || su.postcode) && (
                    <p className="text-sm text-gray-500">{[su.address, su.postcode].filter(Boolean).join(', ')}</p>
                  )}
                </section>
              )}

              {/* Carers */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Carer{carers.length > 1 ? 's' : ''}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {carers.length === 0 && <span className="text-sm text-gray-400">Unassigned</span>}
                  {carers.map((c) => (
                    <span key={c.id} className={`text-sm px-2 py-0.5 rounded-full ${c.id === focusCarerId ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-700'}`}>
                      {c.firstName} {c.lastName}
                    </span>
                  ))}
                </div>
              </section>

              {/* Times */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Times</h3>
                <div className="rounded-lg border border-gray-100 divide-y divide-gray-100 text-sm">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-gray-500">Scheduled</span>
                    <span className="text-gray-800 font-medium">{formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}</span>
                  </div>
                  {clockRecords.length === 0 ? (
                    <div className="px-3 py-2 text-gray-400">No clock-in recorded for this visit</div>
                  ) : (
                    clockRecords.map((r) => (
                      <div key={r.id} className="px-3 py-2">
                        <div className="flex justify-between">
                          <span className={`${r.userId === focusCarerId ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>{carerName(r.userId)}</span>
                          <span className="text-gray-800 font-medium">{fmtDuration(r.clockIn, r.clockOut)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          In {format(new Date(r.clockIn), 'h:mm a')}
                          {r.clockOut ? ` · Out ${format(new Date(r.clockOut), 'h:mm a')}` : ' · not clocked out'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Location/GPS is not recorded for visits.</p>
              </section>

              {/* Medications / eMAR */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Medications</h3>
                {dosesLoading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : shift.givesMedication === false ? (
                  <p className="text-sm text-gray-400">This is a personal-care visit — no medication administered.</p>
                ) : doses.length === 0 ? (
                  <p className="text-sm text-gray-400">No medication due on this visit.</p>
                ) : (
                  <div className="space-y-2">
                    {doses.map((d) => (
                      <div key={`${d.medicationId}-${d.scheduledFor}`} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-800 text-sm flex items-center gap-1.5 flex-wrap">
                            {d.name}{d.dose ? ` · ${d.dose}` : ''}
                            {d.isBlisterPack && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">💊 Pack</span>}
                            {d.prn && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">As required</span>}
                          </p>
                          <span className="text-xs text-gray-400 shrink-0">{d.prn ? 'PRN' : formatTime12h(d.time)}</span>
                        </div>
                        <div className="mt-2">
                          {d.status ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[d.status]}`}>
                              {STATUS_LABEL[d.status]}
                              {d.recordedAt && ` · ${format(new Date(d.recordedAt), 'h:mm a')}`}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-gray-400">Not recorded</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Call log / visit notes */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Call log / notes</h3>
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-400">No call log recorded for this visit.</p>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => {
                      const ticks = parseCallLogTicks(log.tasks);
                      let sigs: CallLogSignature[] = [];
                      try { sigs = log.signedBy ? JSON.parse(log.signedBy) : []; } catch { sigs = []; }
                      return (
                        <div key={log.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium text-gray-700">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown carer'}</span>
                            <span>{format(new Date(log.createdAt), 'h:mm a')}</span>
                          </div>
                          {log.note && <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>}
                          {ticks.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {ticks.map((t, i) => (
                                <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.refused ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                  {t.refused ? '✕' : '✓'} {t.label}{t.detail ? `: ${t.detail}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {sigs.length > 0 && (
                            <p className="text-[11px] text-gray-400 mt-2">Signed by {sigs.map((s) => `${s.firstName} ${s.lastName}`).join(', ')}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Support log (supported-living clients) */}
              {isSL && supportEntries.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Support log</h3>
                  <div className="space-y-2">
                    {supportEntries.map((e) => {
                      let domains: string[] = [];
                      try { domains = JSON.parse(e.domains || '[]'); } catch { domains = []; }
                      return (
                        <div key={e.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium text-gray-700">{e.userName}</span>
                            <span>{format(new Date(e.createdAt), 'h:mm a')}</span>
                          </div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{e.body}</p>
                          {domains.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {domains.map((k) => (
                                <span key={k} className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">🤝 {domainLabel(k)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
