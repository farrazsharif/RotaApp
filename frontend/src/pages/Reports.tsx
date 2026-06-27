import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, CribSheetRow } from '../api/reports';
import { sitesApi } from '../api/sites';
import { usersApi } from '../api/users';
import {
  format, startOfMonth, endOfMonth, parseISO,
  startOfWeek, endOfWeek, addWeeks, subWeeks, subMonths, addDays, subDays,
} from 'date-fns';
import { formatTime12h } from '../lib/time';

type Tab = 'hours' | 'scheduled' | 'crib' | 'overtime' | 'coverage';

const TIMELINE_PRESETS = [
  'Next Week', 'This Week', 'Last Week', 'Two Weeks Ago',
  'This Month', 'Last Month', 'Today', 'Yesterday', 'Tomorrow',
] as const;
type TimelinePreset = typeof TIMELINE_PRESETS[number];

function presetRange(preset: TimelinePreset): { start: Date; end: Date } {
  const today = new Date();
  const wk = (d: Date) => ({ start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) });
  switch (preset) {
    case 'Next Week': return wk(addWeeks(today, 1));
    case 'This Week': return wk(today);
    case 'Last Week': return wk(subWeeks(today, 1));
    case 'Two Weeks Ago': return wk(subWeeks(today, 2));
    case 'This Month': return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'Last Month': { const m = subMonths(today, 1); return { start: startOfMonth(m), end: endOfMonth(m) }; }
    case 'Today': return { start: today, end: today };
    case 'Yesterday': { const d = subDays(today, 1); return { start: d, end: d }; }
    case 'Tomorrow': { const d = addDays(today, 1); return { start: d, end: d }; }
  }
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('hours');
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [timeline, setTimeline] = useState<TimelinePreset | ''>('');
  const [siteFilter, setSiteFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');

  function applyTimeline(preset: string) {
    setTimeline(preset as TimelinePreset);
    if (!preset) return;
    const { start, end } = presetRange(preset as TimelinePreset);
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  }

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });
  const { data: employees = [] } = useQuery({ queryKey: ['users', 'EMPLOYEE'], queryFn: () => usersApi.list({ role: 'EMPLOYEE' }) });
  const { data: shiftRoles = [] } = useQuery({ queryKey: ['shift-roles'], queryFn: reportsApi.shiftRoles });

  const { data: hoursData = [], isLoading: loadingHours } = useQuery({
    queryKey: ['report-hours', startDate, endDate],
    queryFn: () => reportsApi.hours({ startDate, endDate }),
    enabled: tab === 'hours',
  });

  const { data: overtimeData = [], isLoading: loadingOT } = useQuery({
    queryKey: ['report-overtime', startDate, endDate],
    queryFn: () => reportsApi.overtime({ startDate, endDate }),
    enabled: tab === 'overtime',
  });

  const { data: coverageData = [], isLoading: loadingCov } = useQuery({
    queryKey: ['report-coverage', startDate, endDate],
    queryFn: () => reportsApi.coverage({ startDate, endDate }),
    enabled: tab === 'coverage',
  });

  const { data: scheduledData = [], isLoading: loadingScheduled } = useQuery({
    queryKey: ['report-scheduled-hours', startDate, endDate, siteFilter, roleFilter, employeeFilter],
    queryFn: () => reportsApi.scheduledHours({
      startDate, endDate,
      siteId: siteFilter || undefined,
      role: roleFilter || undefined,
      userId: employeeFilter || undefined,
    }),
    enabled: tab === 'scheduled',
  });

  const { data: cribData = [], isLoading: loadingCrib } = useQuery({
    queryKey: ['report-crib-sheet', startDate, endDate],
    queryFn: () => reportsApi.cribSheet({ startDate, endDate }),
    enabled: tab === 'crib',
  });

  const isLoading = loadingHours || loadingOT || loadingCov || loadingScheduled || loadingCrib;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'hours', label: 'Hours Worked' },
    { key: 'scheduled', label: 'Hours Scheduled' },
    { key: 'crib', label: 'Crib Sheet' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'coverage', label: 'Shift Coverage' },
  ];

  const term = search.trim().toLowerCase();

  // Per-tab filtered data
  const filteredHours = hoursData.filter((r) => !term || r.name.toLowerCase().includes(term));
  const filteredScheduled = scheduledData.filter((r) => !term || r.name.toLowerCase().includes(term));
  const filteredCrib = (cribData as CribSheetRow[]).filter(
    (r) => !term || r.employee.toLowerCase().includes(term) || r.serviceUser.toLowerCase().includes(term),
  );
  const filteredOvertime = overtimeData.filter((r) => !term || r.name.toLowerCase().includes(term));

  const schedGrandTotal = filteredScheduled.reduce((s, r) => s + r.total, 0);

  function exportScheduledCsv() {
    const lines = [['Employee', 'Hours'].join(',')];
    for (const row of filteredScheduled) lines.push([row.name, row.total].join(','));
    lines.push(['Total', (Math.round(schedGrandTotal * 100) / 100).toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-scheduled_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      {/* Filters + Search */}
      <div className="card flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Timeline</label>
          <select value={timeline} onChange={(e) => applyTimeline(e.target.value)} className="input">
            <option value="">Custom</option>
            {TIMELINE_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => { setTimeline(''); setStartDate(e.target.value); }} className="input" />
        </div>
        <div>
          <label className="label">End Date</label>
          <input type="date" value={endDate} onChange={(e) => { setTimeline(''); setEndDate(e.target.value); }} className="input" />
        </div>
        {tab === 'scheduled' && (
          <>
            <div>
              <label className="label">Location Filter</label>
              <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="input">
                <option value="">All Locations</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Position Filter</label>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input">
                <option value="">Select Positions</option>
                {shiftRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Employee Filter</label>
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input">
                <option value="">Select Employees</option>
                {employees.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or service user…"
            className="input w-full"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>}

      {/* Hours Worked */}
      {tab === 'hours' && !loadingHours && (
        <div>
          {filteredHours.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching employees' : 'No data for this period'}</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Clock Records</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total Hours</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Est. Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredHours.map((row) => (
                    <tr key={row.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{row.records}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{row.totalHours}h</td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold">£{row.totalPay.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{filteredHours.reduce((s, r) => s + r.records, 0)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{filteredHours.reduce((s, r) => s + r.totalHours, 0).toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-green-700">£{filteredHours.reduce((s, r) => s + r.totalPay, 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Hours Scheduled */}
      {tab === 'scheduled' && !loadingScheduled && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-700">
            Hours Scheduled Between: {format(parseISO(startDate), 'dd-MM-yyyy')} - {format(parseISO(endDate), 'dd-MM-yyyy')}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => window.print()} className="btn-secondary btn">Print</button>
            <button onClick={exportScheduledCsv} className="btn-secondary btn">Export</button>
          </div>
          {filteredScheduled.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching employees' : 'No scheduled shifts in this period'}</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredScheduled.map((row) => (
                    <tr key={row.userId} className={`hover:bg-gray-50 ${row.userId === 'unassigned' ? 'bg-red-50' : ''}`}>
                      <td className={`px-4 py-3 font-medium ${row.userId === 'unassigned' ? 'text-red-700' : ''}`}>{row.name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{row.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3">Total: ({filteredScheduled.length})</td>
                    <td className="px-4 py-3 text-right text-blue-700">{(Math.round(schedGrandTotal * 100) / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Crib Sheet */}
      {tab === 'crib' && !loadingCrib && (
        <div>
          {filteredCrib.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching results' : 'No scheduled shifts in this period'}</div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Position</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Service User</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Start Time</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Clock In</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">End Time</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Clock Out</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCrib.map((row, i) => (
                    <tr key={i} className={`hover:bg-gray-50 ${row.employee === 'Unassigned' ? 'bg-red-50' : ''}`}>
                      <td className={`px-4 py-2.5 font-medium ${row.employee === 'Unassigned' ? 'text-red-700' : ''}`}>{row.employee}</td>
                      <td className="px-4 py-2.5 text-gray-600">{row.position}</td>
                      <td className="px-4 py-2.5 text-gray-800">{row.serviceUser}</td>
                      <td className="px-4 py-2.5 text-gray-600">{format(parseISO(row.date), 'dd-MM-yyyy')}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{formatTime12h(row.startTime)}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.clockIn ? format(parseISO(row.clockIn), 'h:mm a') : '—'}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{formatTime12h(row.endTime)}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.clockOut ? format(parseISO(row.clockOut), 'h:mm a') : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-600">{row.totalHours}h</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={8} className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right text-blue-700">
                      {(Math.round(filteredCrib.reduce((s, r) => s + r.totalHours, 0) * 100) / 100).toFixed(1)}h
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Overtime */}
      {tab === 'overtime' && !loadingOT && (
        <div>
          {filteredOvertime.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching employees' : 'No overtime recorded in this period'}</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Week Starting</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Regular (40h)</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Overtime</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOvertime.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-gray-600">{format(new Date(row.weekStarting), 'dd MMM yyyy')}</td>
                      <td className="px-4 py-3 text-right">40h</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600">{row.overtimeHours}h</td>
                      <td className="px-4 py-3 text-right text-blue-600">{row.totalHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Coverage — grouped by date; search filters by date string */}
      {tab === 'coverage' && !loadingCov && (
        <div>
          {coverageData.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">No shifts in this period</div>
          ) : (
            <div className="space-y-3">
              {coverageData
                .filter((day) => !term || format(new Date(day.date), 'EEEE dd MMM yyyy').toLowerCase().includes(term))
                .map((day) => (
                  <div key={day.date} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-800">{format(new Date(day.date), 'EEEE, dd MMM yyyy')}</h3>
                      <div className="flex gap-3 text-sm">
                        <span className="badge-blue badge">{day.scheduledCount} shifts</span>
                        <span className="badge-green badge">{day.scheduledHours.toFixed(1)}h total</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
