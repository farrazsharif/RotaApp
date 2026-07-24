import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, CribSheetRow, EcmRow, ScheduledHoursRow } from '../api/reports';
import { sitesApi } from '../api/sites';
import { usersApi } from '../api/users';
import { serviceUsersApi } from '../api/serviceUsers';
import { SUPPORT_CATEGORIES, parseCategories } from '../lib/supportCategories';
import {
  format, startOfMonth, endOfMonth, parseISO,
  startOfWeek, endOfWeek, addWeeks, subWeeks, subMonths, addDays, subDays, differenceInYears, differenceInCalendarDays,
} from 'date-fns';
import { formatTime12h } from '../lib/time';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import CarerRota from '../components/CarerRota';

type Tab = 'hours' | 'scheduled' | 'crib' | 'overtime' | 'coverage' | 'capacity' | 'ecm' | 'rota';

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
  const [tab, setTab] = useState<Tab>('scheduled');
  const thisWeek = presetRange('This Week');
  const [startDate, setStartDate] = useState(format(thisWeek.start, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(thisWeek.end, 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [timeline, setTimeline] = useState<TimelinePreset | ''>('This Week');
  const [siteFilter, setSiteFilter] = useState<string[]>([]);
  const siteIdParam = siteFilter.length ? siteFilter.join(',') : undefined;
  const [roleFilter, setRoleFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);
  const userIdParam = employeeFilter.length ? employeeFilter.join(',') : undefined;
  const [patientFilter, setPatientFilter] = useState<string[]>([]);
  const serviceUserIdParam = patientFilter.length ? patientFilter.join(',') : undefined;
  // Rota tab: the single carer whose 4-week rota is shown for download/print.
  const [rotaUserId, setRotaUserId] = useState('');
  // ECM loads on demand (not on tab open) so a big rota isn't fetched every
  // time, and a view filter narrows to just missed/recorded/short.
  const [ecmView, setEcmView] = useState('missed');
  const [ecmRun, setEcmRun] = useState(false);
  // Hours Scheduled can group by carer (default) or by patient/client.
  const [schedGroupBy, setSchedGroupBy] = useState<'carer' | 'client'>('carer');

  function applyTimeline(preset: string) {
    setTimeline(preset as TimelinePreset);
    if (!preset) return;
    const { start, end } = presetRange(preset as TimelinePreset);
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  }

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });
  // Every staff member for the carer filter — all roles and all states (active,
  // inactive, and invited/pending), so the list is complete. The backend already
  // excludes family accounts when no role is passed.
  const { data: employees = [] } = useQuery({ queryKey: ['users', 'all-staff'], queryFn: () => usersApi.list() });
  // Active service users for the patient filter (only relevant on the Hours
  // Scheduled and ECM tabs, so it loads there).
  const { data: filterServiceUsers = [] } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
    enabled: tab === 'scheduled' || tab === 'ecm',
  });
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
    queryKey: ['report-scheduled-hours', startDate, endDate, siteIdParam, roleFilter, userIdParam, serviceUserIdParam, schedGroupBy],
    queryFn: () => reportsApi.scheduledHours({
      startDate, endDate,
      siteId: siteIdParam,
      role: roleFilter || undefined,
      userId: userIdParam,
      serviceUserId: serviceUserIdParam,
      groupBy: schedGroupBy,
    }),
    enabled: tab === 'scheduled',
  });

  const { data: cribData = [], isLoading: loadingCrib } = useQuery({
    queryKey: ['report-crib-sheet', startDate, endDate],
    queryFn: () => reportsApi.cribSheet({ startDate, endDate }),
    enabled: tab === 'crib',
  });

  const { data: activeServiceUsers = [] } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
    enabled: tab === 'capacity',
  });

  const { data: ecmData = [], isLoading: loadingEcm } = useQuery({
    queryKey: ['report-ecm', startDate, endDate, siteIdParam, userIdParam, serviceUserIdParam, ecmView],
    queryFn: () => reportsApi.ecm({ startDate, endDate, siteId: siteIdParam, userId: userIdParam, serviceUserId: serviceUserIdParam, view: ecmView }),
    enabled: tab === 'ecm' && ecmRun,
  });
  // Reset ECM to its empty state whenever you leave the tab, so re-opening it
  // shows the "Run report" prompt instead of auto-fetching a big list.
  useEffect(() => { if (tab !== 'ecm') setEcmRun(false); }, [tab]);
  // Local edits to short-visit reasons, keyed by shiftId (shared across a shift's
  // carer rows). Saved on blur; never touches the clock times.
  const [ecmNotes, setEcmNotes] = useState<Record<string, string>>({});

  // CQC PIR: number of active service users in each support category
  // (a person is counted in every category that applies).
  const categoryCounts = SUPPORT_CATEGORIES.map((category) => ({
    category,
    count: activeServiceUsers.filter((su) => parseCategories(su.supportCategories).includes(category)).length,
  }));
  // CQC PIR: number of active service users in each age bracket, from DOB.
  const AGE_BANDS: { label: string; min: number; max: number }[] = [
    { label: '0 to 17 years', min: 0, max: 17 },
    { label: '18 to 24 years', min: 18, max: 24 },
    { label: '25 to 64 years', min: 25, max: 64 },
    { label: '65 to 74 years', min: 65, max: 74 },
    { label: '75 to 84 years', min: 75, max: 84 },
    { label: '85 to 94 years', min: 85, max: 94 },
    { label: '95 years and over', min: 95, max: Infinity },
  ];
  const ageOf = (dob?: string | null) => (dob ? differenceInYears(new Date(), new Date(dob)) : null);
  const ageBandCounts = AGE_BANDS.map((b) => ({
    label: b.label,
    count: activeServiceUsers.filter((su) => {
      const a = ageOf(su.dateOfBirth);
      return a != null && a >= b.min && a <= b.max;
    }).length,
  }));
  const unknownAgeCount = activeServiceUsers.filter((su) => ageOf(su.dateOfBirth) == null).length;

  const copyCapacity = () => {
    const text = [
      ...categoryCounts.map((r) => `${r.category}\t${r.count}`),
      '',
      ...ageBandCounts.map((r) => `${r.label}\t${r.count}`),
    ].join('\n');
    navigator.clipboard?.writeText(text);
  };

  const isLoading = loadingHours || loadingOT || loadingCov || loadingScheduled || loadingCrib || loadingEcm;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'scheduled', label: 'Hours Scheduled' },
    { key: 'rota', label: 'Rota (send to carer)' },
    { key: 'hours', label: 'Hours Worked' },
    { key: 'crib', label: 'Crib Sheet' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'coverage', label: 'Shift Coverage' },
    { key: 'ecm', label: 'ECM' },
    { key: 'capacity', label: 'CQC PIR' },
  ];

  const term = search.trim().toLowerCase();

  // Per-tab filtered data
  const filteredHours = hoursData.filter((r) => !term || r.name.toLowerCase().includes(term));
  const filteredScheduled = scheduledData.filter((r) => !term || r.name.toLowerCase().includes(term));
  const filteredCrib = (cribData as CribSheetRow[]).filter(
    (r) => !term || r.employee.toLowerCase().includes(term) || r.serviceUser.toLowerCase().includes(term),
  );
  const filteredOvertime = overtimeData.filter((r) => !term || r.name.toLowerCase().includes(term));

  // Unassigned hours are shown separately and excluded from the carer total.
  const schedAssigned = filteredScheduled.filter((r) => r.userId !== 'unassigned');
  const schedUnassigned = filteredScheduled.filter((r) => r.userId === 'unassigned');
  const schedGrandTotal = schedAssigned.reduce((s, r) => s + r.total, 0);
  const schedUnassignedTotal = schedUnassigned.reduce((s, r) => s + r.total, 0);
  const schedAllTotal = schedGrandTotal + schedUnassignedTotal;

  // By-patient "required vs scheduled": scale each patient's weekly contracted
  // hours to the selected range (7-day range ×1, 14-day ×2, etc.). Only shown
  // once at least one patient has a contracted figure set.
  const rangeWeeks = Math.max(differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1, 1) / 7;
  const showRequired = schedGroupBy === 'client' && filteredScheduled.some((r) => r.contracted != null);
  const requiredFor = (r: ScheduledHoursRow) => (r.contracted != null ? Math.round(r.contracted * rangeWeeks * 100) / 100 : null);
  const schedRequiredTotal = showRequired ? schedAssigned.reduce((s, r) => s + (requiredFor(r) ?? 0), 0) : 0;

  function exportScheduledCsv() {
    const header = showRequired
      ? ['Patient', 'Scheduled', 'Required', 'Difference']
      : [schedGroupBy === 'client' ? 'Patient' : 'Carer', 'Hours'];
    const lines = [header.join(',')];
    for (const row of schedAssigned) {
      if (showRequired) {
        const req = requiredFor(row);
        lines.push([row.name, row.total, req ?? '', req != null ? (Math.round((row.total - req) * 100) / 100) : ''].join(','));
      } else {
        lines.push([row.name, row.total].join(','));
      }
    }
    if (showRequired) {
      lines.push(['Total', (Math.round(schedGrandTotal * 100) / 100).toFixed(2), (Math.round(schedRequiredTotal * 100) / 100).toFixed(2), (Math.round((schedGrandTotal - schedRequiredTotal) * 100) / 100).toFixed(2)].join(','));
    } else {
      lines.push(['Total', (Math.round(schedGrandTotal * 100) / 100).toFixed(2)].join(','));
    }
    for (const row of schedUnassigned) lines.push([row.name, row.total].join(','));
    if (schedUnassigned.length > 0) lines.push(['Total (assigned + unassigned)', (Math.round(schedAllTotal * 100) / 100).toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-scheduled_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredEcm = ecmData.filter((r) => !term || `${r.serviceUser} ${r.carer} ${r.site}`.toLowerCase().includes(term));
  const ecmSummary = {
    visits: filteredEcm.length,
    attended: filteredEcm.filter((r) => r.status === 'attended').length,
    missed: filteredEcm.filter((r) => r.status === 'not_attended').length,
    short: filteredEcm.filter((r) => r.short).length,
    scheduledHrs: filteredEcm.reduce((s, r) => s + r.scheduledMins, 0) / 60,
    actualHrs: filteredEcm.reduce((s, r) => s + (r.actualMins ?? 0), 0) / 60,
  };
  const ecmAttendancePct = ecmSummary.visits ? Math.round((ecmSummary.attended / ecmSummary.visits) * 100) : 0;
  const noteFor = (r: EcmRow) => (r.shiftId in ecmNotes ? ecmNotes[r.shiftId] : r.ecmNote);
  const ecmClock = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '');
  const STATUS_LABEL: Record<EcmRow['status'], string> = { attended: 'Attended', no_clock_out: 'No clock-out', not_attended: 'Not attended' };

  function exportEcmCsv() {
    const head = ['Date', 'Service User', 'Site', 'Carer', 'Visit', 'Scheduled Start', 'Scheduled End', 'Scheduled Mins', 'Clock In', 'Clock Out', 'Actual Mins', 'Variance Mins', 'Status', 'Reason'];
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')];
    for (const r of filteredEcm) {
      lines.push([r.date, r.serviceUser, r.site, r.carer, r.visitName || '', `${r.date} ${r.scheduledStart}`, `${r.date} ${r.scheduledEnd}`, r.scheduledMins, ecmClock(r.clockIn), ecmClock(r.clockOut), r.actualMins ?? '', r.variance ?? '', STATUS_LABEL[r.status], noteFor(r)].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecm_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      {/* Filters + Search — not relevant to the caseload Capacity tab or the
          self-contained Rota tab (which has its own carer + date controls). */}
      {tab !== 'capacity' && tab !== 'rota' && (
      <div className="card flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Timeline</label>
          <select value={timeline} onChange={(e) => applyTimeline(e.target.value)} className="input">
            {timeline === '' && <option value="">Custom</option>}
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
        {(tab === 'scheduled' || tab === 'ecm') && (
          <>
            <div className="w-44">
              <label className="label">Location Filter</label>
              <MultiSelectDropdown
                options={sites.map((s) => ({ value: s.id, label: s.name }))}
                selected={siteFilter}
                onChange={setSiteFilter}
                allLabel="All Locations"
              />
            </div>
            {tab === 'scheduled' && (
              <div className="w-44">
                <label className="label">Position Filter</label>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input">
                  <option value="">Select Positions</option>
                  {shiftRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div className="w-44">
              <label className="label">Carer Filter</label>
              <MultiSelectDropdown
                options={employees.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                selected={employeeFilter}
                onChange={setEmployeeFilter}
                allLabel="All Carers"
              />
            </div>
            <div className="w-44">
              <label className="label">Service User Filter</label>
              <MultiSelectDropdown
                options={[...filterServiceUsers]
                  .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                  .map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))}
                selected={patientFilter}
                onChange={setPatientFilter}
                allLabel="All Service Users"
              />
            </div>
          </>
        )}
        <div className="w-full sm:w-56">
          <label className="label">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="input w-full"
          />
        </div>
      </div>
      )}

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

      {/* CQC PIR — support-category counts for active service users */}
      {tab === 'capacity' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Active service users: {activeServiceUsers.length}</div>
            <button onClick={copyCapacity} className="btn-secondary btn">Copy</button>
          </div>
          <div className="card p-0 overflow-x-auto max-w-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categoryCounts.map((r) => (
                  <tr key={r.category} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800">{r.category}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">Counts include active service users only. A person is counted in every category that applies.</p>

          <div className="pt-2">
            <div className="text-sm font-semibold text-gray-700 mb-2">Age brackets</div>
            <div className="card p-0 overflow-x-auto max-w-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Age bracket</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ageBandCounts.map((r) => (
                    <tr key={r.label} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800">{r.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{r.count}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right text-blue-700">{ageBandCounts.reduce((s, r) => s + r.count, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {unknownAgeCount > 0 && (
              <p className="text-xs text-amber-600 mt-2">{unknownAgeCount} active service user{unknownAgeCount > 1 ? 's have' : ' has'} no date of birth recorded and {unknownAgeCount > 1 ? 'are' : 'is'} not included in the age brackets.</p>
            )}
          </div>
        </div>
      )}

      {/* Rota — pick a carer, then download/print their 4-week rota to send */}
      {tab === 'rota' && (
        <div className="space-y-4">
          <div className="card">
            <label className="label">Carer</label>
            <select value={rotaUserId} onChange={(e) => setRotaUserId(e.target.value)} className="input w-full sm:w-80">
              <option value="">Select a carer…</option>
              {[...employees]
                .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                .map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">Pick a carer to see their rota, then Download CSV or Print / Save as PDF to send it to them.</p>
          </div>
          {rotaUserId && (() => {
            const c = employees.find((u) => u.id === rotaUserId);
            return <CarerRota userId={rotaUserId} staffName={c ? `${c.firstName} ${c.lastName}` : 'Carer'} />;
          })()}
        </div>
      )}

      {/* Hours Worked */}
      {tab === 'hours' && !loadingHours && (
        <div>
          {filteredHours.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching employees' : 'No data for this period'}</div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
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
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button onClick={() => setSchedGroupBy('carer')} className={`px-3 py-1.5 ${schedGroupBy === 'carer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>By carer</button>
              <button onClick={() => setSchedGroupBy('client')} className={`px-3 py-1.5 border-l border-gray-200 ${schedGroupBy === 'client' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>By patient</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-secondary btn">Print</button>
              <button onClick={exportScheduledCsv} className="btn-secondary btn">Export</button>
            </div>
          </div>
          {filteredScheduled.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matches' : 'No scheduled shifts in this period'}</div>
          ) : (
            <div className={`card p-0 overflow-x-auto ${showRequired ? 'max-w-2xl' : 'max-w-md'}`}>
              {showRequired && (
                <p className="text-xs text-gray-500 px-4 pt-3">
                  "Required" = each patient's contracted weekly hours × {rangeWeeks % 1 === 0 ? rangeWeeks : rangeWeeks.toFixed(2)} week{rangeWeeks === 1 ? '' : 's'} in this range. "Scheduled" is contact hours — a double-up visit counts once per carer, so it lines up with council-commissioned hours. A red difference means the rota is short of the care package.
                </p>
              )}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-2/3">{schedGroupBy === 'client' ? 'Patient' : 'Carer'}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
                    {showRequired && <th className="text-left px-4 py-3 font-medium text-gray-600">Required</th>}
                    {showRequired && <th className="text-left px-4 py-3 font-medium text-gray-600">+/-</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schedAssigned.map((row) => {
                    const req = showRequired ? requiredFor(row) : null;
                    const diff = req != null ? Math.round((row.total - req) * 100) / 100 : null;
                    const diffCls = diff == null ? '' : diff < -0.05 ? 'text-red-600' : diff > 0.05 ? 'text-amber-600' : 'text-green-600';
                    return (
                      <tr key={row.userId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600">{row.total.toFixed(2)}</td>
                        {showRequired && <td className="px-4 py-3 text-gray-700">{req != null ? req.toFixed(2) : '—'}</td>}
                        {showRequired && <td className={`px-4 py-3 font-semibold ${diffCls}`}>{diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}</td>}
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3">Total: ({schedAssigned.length})</td>
                    <td className="px-4 py-3 text-blue-700">{(Math.round(schedGrandTotal * 100) / 100).toFixed(2)}</td>
                    {showRequired && <td className="px-4 py-3 text-gray-700">{(Math.round(schedRequiredTotal * 100) / 100).toFixed(2)}</td>}
                    {showRequired && (() => {
                      const d = Math.round((schedGrandTotal - schedRequiredTotal) * 100) / 100;
                      return <td className={`px-4 py-3 ${d < -0.05 ? 'text-red-700' : d > 0.05 ? 'text-amber-700' : 'text-green-700'}`}>{d > 0 ? '+' : ''}{d.toFixed(2)}</td>;
                    })()}
                  </tr>
                  {schedUnassigned.map((row) => (
                    <tr key={row.userId} className="bg-red-50">
                      <td className="px-4 py-3 font-medium text-red-700">{row.name}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{row.total.toFixed(2)}</td>
                      {showRequired && <td className="px-4 py-3" />}
                      {showRequired && <td className="px-4 py-3" />}
                    </tr>
                  ))}
                  {schedUnassigned.length > 0 && (
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td className="px-4 py-3">Total (assigned + unassigned)</td>
                      <td className="px-4 py-3 text-gray-900">{(Math.round(schedAllTotal * 100) / 100).toFixed(2)}</td>
                      {showRequired && <td className="px-4 py-3" />}
                      {showRequired && <td className="px-4 py-3" />}
                    </tr>
                  )}
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
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
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
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

      {/* ECM — Electronic Call Monitoring: scheduled vs actual (clocked) times */}
      {tab === 'ecm' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500 max-w-2xl">
              Actual clocked times exactly as recorded. Short or missed visits are flagged — add a reason so the submission is documented. Times are never altered.
            </p>
            <div className="flex items-center gap-2">
              <select value={ecmView} onChange={(e) => setEcmView(e.target.value)} className="input w-40" title="Which visits to show">
                <option value="missed">Missed visits</option>
                <option value="recorded">Recorded (clocked)</option>
                <option value="short">Short visits</option>
                <option value="all">All visits</option>
              </select>
              <button onClick={() => setEcmRun(true)} className="btn-primary btn">{ecmRun ? 'Refresh' : 'Run report'}</button>
              <button onClick={exportEcmCsv} disabled={!ecmRun || filteredEcm.length === 0} className="btn-secondary btn">Export CSV</button>
            </div>
          </div>

          {!ecmRun ? (
            <div className="card text-center py-12 text-gray-400">Choose a view and date range above, then <span className="font-medium text-gray-600">Run report</span>.</div>
          ) : loadingEcm ? null : (
          <>

          {filteredEcm.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="card p-4"><div className="text-2xl font-bold text-gray-900">{ecmSummary.visits}</div><div className="text-xs text-gray-500 mt-0.5">Visits</div></div>
              <div className="card p-4"><div className={`text-2xl font-bold ${ecmAttendancePct >= 95 ? 'text-green-600' : ecmAttendancePct >= 85 ? 'text-amber-600' : 'text-red-600'}`}>{ecmAttendancePct}%</div><div className="text-xs text-gray-500 mt-0.5">Attendance</div></div>
              <div className="card p-4"><div className="text-2xl font-bold text-blue-600">{ecmSummary.scheduledHrs.toFixed(1)}h</div><div className="text-xs text-gray-500 mt-0.5">Scheduled hrs</div></div>
              <div className="card p-4"><div className="text-2xl font-bold text-blue-600">{ecmSummary.actualHrs.toFixed(1)}h</div><div className="text-xs text-gray-500 mt-0.5">Actual hrs</div></div>
              <div className="card p-4"><div className="text-2xl font-bold text-amber-600">{ecmSummary.short}</div><div className="text-xs text-gray-500 mt-0.5">Short visits</div></div>
              <div className="card p-4"><div className="text-2xl font-bold text-red-600">{ecmSummary.missed}</div><div className="text-xs text-gray-500 mt-0.5">Missed</div></div>
            </div>
          )}

          {filteredEcm.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching visits' : 'No visits in this period'}</div>
          ) : (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Service User</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Site</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Carer</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Scheduled</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Clock In</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Clock Out</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Actual</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Variance</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Reason (short/missed)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEcm.map((r, i) => (
                    <tr key={`${r.shiftId}-${i}`} className={`hover:bg-gray-50 ${r.status === 'not_attended' ? 'bg-red-50' : r.short ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{format(parseISO(r.date), 'dd-MM-yyyy')}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{r.serviceUser}</td>
                      <td className="px-3 py-2.5 text-gray-600">{r.site}</td>
                      <td className={`px-3 py-2.5 ${r.carer === 'Unassigned' ? 'text-red-600' : 'text-gray-800'}`}>{r.carer}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600 whitespace-nowrap">{formatTime12h(r.scheduledStart)}–{formatTime12h(r.scheduledEnd)}<div className="text-xs text-gray-400">{r.scheduledMins} mins</div></td>
                      <td className="px-3 py-2.5 text-center text-gray-700 whitespace-nowrap">{r.clockIn ? format(parseISO(r.clockIn), 'h:mm a') : <span className="text-red-500">—</span>}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700 whitespace-nowrap">{r.clockOut ? format(parseISO(r.clockOut), 'h:mm a') : <span className="text-amber-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{r.actualMins != null ? `${r.actualMins} mins` : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2.5 text-right whitespace-nowrap font-medium ${r.variance == null ? 'text-gray-300' : r.variance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {r.variance == null ? '—' : `${r.variance > 0 ? '+' : ''}${r.variance}`}
                      </td>
                      <td className="px-3 py-2.5">
                        {(r.short || r.status !== 'attended') ? (
                          <input
                            value={noteFor(r)}
                            onChange={(e) => setEcmNotes((p) => ({ ...p, [r.shiftId]: e.target.value }))}
                            onBlur={(e) => reportsApi.saveEcmNote(r.shiftId, e.target.value)}
                            placeholder="Reason…"
                            className="w-44 border border-gray-300 rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                          />
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
