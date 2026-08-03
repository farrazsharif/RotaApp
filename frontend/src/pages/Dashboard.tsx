import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reportsApi } from '../api/reports';
import { shiftsApi } from '../api/shifts';
import { clockApi } from '../api/clock';
import { supervisionApi } from '../api/supervision';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { format, startOfWeek, endOfWeek, formatDistanceToNow } from 'date-fns';
import { Shift } from '../types';
import { formatTime12h } from '../lib/time';

function shiftDuration(s: Shift) {
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim();
}

function Kpi({ label, value, sub, bar, to }: { label: string; value: ReactNode; sub?: ReactNode; bar?: number; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
      {bar !== undefined && (
        <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
      {sub && <p className="text-xs mt-1.5">{sub}</p>}
    </>
  );
  const cls = 'card block';
  return to ? <Link to={to} className={`${cls} hover:shadow-md transition-shadow`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function AlertTile({ count, label, tone, to }: { count: number; label: string; tone: 'danger' | 'warning'; to?: string }) {
  const numCls = tone === 'danger' ? 'text-red-600' : 'text-amber-600';
  const body = (
    <>
      <div className={`text-2xl font-bold ${numCls}`}>{count}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </>
  );
  const cls = 'bg-white rounded-lg px-3 py-2.5 block';
  return to ? <Link to={to} className={`${cls} hover:ring-1 hover:ring-red-200`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const { can } = usePermissions();
  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: stats } = useQuery({ queryKey: ['dashboard-stats'], queryFn: reportsApi.dashboard, enabled: isManager });

  const { data: supervision } = useQuery({ queryKey: ['supervision-summary'], queryFn: supervisionApi.summary, enabled: can('manage_supervision') });

  const { data: myShifts = [] } = useQuery({
    queryKey: ['shifts', 'my', weekStart, weekEnd],
    queryFn: () => shiftsApi.list({ startDate: weekStart, endDate: weekEnd, userId: user?.id }),
  });

  const { data: activeClockRecords = [] } = useQuery({
    queryKey: ['clock-active'], queryFn: clockApi.active, enabled: isManager, refetchInterval: 30_000,
  });

  const todayShifts = myShifts.filter((s) => format(new Date(s.date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'));
  const alertTotal = stats ? stats.lateCheckins + stats.unassignedToday + stats.missedMeds + stats.expiringCompliance : 0;
  const visitsPct = stats && stats.visitsToday.total ? Math.round((stats.visitsToday.completed / stats.visitsToday.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName}!
          </h1>
          <p className="text-gray-500 mt-1">{format(today, 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('manage_schedule') && <Link to="/schedule" className="btn-secondary btn">+ Add shift</Link>}
          {can('manage_schedule') && <Link to="/schedule" className="btn-secondary btn">Publish rota</Link>}
          {can('manage_schedule') && <Link to="/attendance" className="btn-secondary btn">⏱️ Attendance</Link>}
          {can('manage_billing') && <Link to="/finances" className="btn-primary btn">New invoice</Link>}
        </div>
      </div>

      {/* Needs attention */}
      {isManager && stats && (
        alertTotal > 0 ? (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-red-600">⚠</span>
              <span className="font-medium text-red-700">Needs attention now</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {stats.lateCheckins > 0 && <AlertTile count={stats.lateCheckins} label="Late / missed check-ins" tone="danger" to="/late-checkins" />}
              {stats.unassignedToday > 0 && <AlertTile count={stats.unassignedToday} label="Unassigned visits today" tone="danger" to="/schedule" />}
              {stats.missedMeds > 0 && <AlertTile count={stats.missedMeds} label="Meds missed today" tone="warning" to="/missed-meds" />}
              {stats.expiringCompliance > 0 && <AlertTile count={stats.expiringCompliance} label="DBS / training expiring" tone="warning" to="/users" />}
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-100 rounded-xl p-3.5 flex items-center gap-2 text-sm text-green-800">
            <span>✓</span> All clear — no unassigned visits, late check-ins, missed meds or expiring compliance.
          </div>
        )
      )}

      {/* KPIs */}
      {isManager && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            label="Visits today"
            value={<>{stats.visitsToday.completed} <span className="text-sm text-gray-400 font-normal">/ {stats.visitsToday.total}</span></>}
            bar={visitsPct}
            to="/schedule"
          />
          <Kpi label="Visits this week" value={stats.shiftsThisWeek} to="/schedule" />
          <Kpi label="Active carers" value={stats.totalEmployees} sub={<span className="text-gray-500">{activeClockRecords.length} on call now</span>} to="/users" />
          <Kpi label="Pending time off" value={stats.pendingTimeOff} to="/time-off" />
        </div>
      )}

      {/* Supervision summary */}
      {can('manage_supervision') && supervision && (
        <Link to="/supervision" className="card block hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Supervision</h2>
            <span className="text-sm text-blue-600">Open →</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div><p className="text-2xl font-bold text-red-600">{supervision.risk.items.filter((i) => i.overdue).length}</p><p className="text-xs text-gray-500">Risk overdue</p></div>
            <div><p className="text-2xl font-bold text-amber-600">{supervision.reviews.dueCount}</p><p className="text-xs text-gray-500">Reviews due</p></div>
            <div><p className="text-2xl font-bold text-blue-600">{supervision.spotChecks.dueCount}</p><p className="text-xs text-gray-500">Spot checks due</p></div>
            <div><p className="text-2xl font-bold text-purple-600">{supervision.supervisions.dueCount}</p><p className="text-xs text-gray-500">Supervisions due</p></div>
          </div>
        </Link>
      )}

      {/* Live ops + coverage */}
      {isManager && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">On call now</h2>
              <span className="badge badge-green">{activeClockRecords.length} clocked in</span>
            </div>
            {activeClockRecords.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">No carers are currently clocked in</p>
            ) : (
              <div className="space-y-2">
                {activeClockRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">{r.user.firstName} {r.user.lastName}</p>
                      <p className="text-sm text-gray-500">
                        {r.shift?.serviceUser
                          ? `${r.shift.serviceUser.firstName} ${r.shift.serviceUser.lastName}${r.shift.visitName ? ` · ${r.shift.visitName}` : ''}`
                          : 'No call linked'}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">since {format(new Date(r.clockIn), 'h:mm a')} · {formatDistanceToNow(new Date(r.clockIn))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">This week's coverage</h2>
              <Link to="/schedule" className="text-blue-600 text-sm hover:underline">Open schedule →</Link>
            </div>
            {!stats ? (
              <p className="text-gray-400 text-sm py-4 text-center">Loading…</p>
            ) : (
              <div className="space-y-2.5">
                {stats.coverage.map((c) => {
                  const color = c.total === 0 ? 'bg-gray-200' : c.pct >= 90 ? 'bg-green-500' : c.pct >= 75 ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={c.date} className="flex items-center gap-3">
                      <span className="w-9 text-xs text-gray-500 uppercase">{c.day}</span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${c.total === 0 ? 100 : c.pct}%` }} />
                      </div>
                      <span className="w-16 text-right text-xs text-gray-500">
                        {c.total === 0 ? 'none' : `${c.filled}/${c.total}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Personal shifts (carers, and a handy view for managers too) */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{isManager ? 'My shifts today' : "Today's shifts"}</h2>
          {todayShifts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No shifts scheduled for today</p>
          ) : (
            <div className="space-y-3">
              {todayShifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">
                      {s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : (s.role || 'Shift')}
                    </p>
                    <p className="text-sm text-gray-500">{formatTime12h(s.startTime)} – {formatTime12h(s.endTime)} · {shiftDuration(s)}</p>
                  </div>
                  <span className={`badge ${s.status === 'SCHEDULED' ? 'badge-blue' : s.status === 'COMPLETED' ? 'badge-green' : 'badge-gray'}`}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">My week</h2>
          {myShifts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No shifts this week</p>
          ) : (
            <div className="space-y-2">
              {myShifts.slice(0, 7).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="text-center w-10">
                      <p className="text-xs text-gray-400 uppercase">{format(new Date(s.date), 'EEE')}</p>
                      <p className="text-lg font-bold text-gray-700">{format(new Date(s.date), 'd')}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : (s.role || 'Shift')}</p>
                      <p className="text-xs text-gray-500">{formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}</p>
                    </div>
                  </div>
                  <span className={`badge ${s.status === 'SCHEDULED' ? 'badge-blue' : 'badge-gray'}`}>{shiftDuration(s)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
