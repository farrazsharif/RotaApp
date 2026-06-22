import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, CribSheetRow } from '../api/reports';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

type Tab = 'hours' | 'scheduled' | 'crib' | 'overtime' | 'coverage';

export default function Reports() {
  const [tab, setTab] = useState<Tab>('hours');
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');

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
    queryKey: ['report-scheduled-hours', startDate, endDate],
    queryFn: () => reportsApi.scheduledHours({ startDate, endDate }),
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      {/* Filters + Search */}
      <div className="card flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
        </div>
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
        <div>
          {filteredScheduled.length === 0 ? (
            <div className="card text-center py-12 text-gray-400">{term ? 'No matching employees' : 'No scheduled shifts in this period'}</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Visits</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Scheduled Hours</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Est. Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredScheduled.map((row) => (
                    <tr key={row.userId} className={`hover:bg-gray-50 ${row.userId === 'unassigned' ? 'bg-red-50' : ''}`}>
                      <td className={`px-4 py-3 font-medium ${row.userId === 'unassigned' ? 'text-red-700' : ''}`}>{row.name}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{row.visits}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">{row.total}h</td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold">{row.userId === 'unassigned' ? '—' : `£${row.estPay.toFixed(2)}`}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{filteredScheduled.reduce((s, r) => s + r.visits, 0)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{(Math.round(schedGrandTotal * 100) / 100).toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-green-700">£{filteredScheduled.reduce((s, r) => s + r.estPay, 0).toFixed(2)}</td>
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
                      <td className="px-3 py-2.5 text-center text-gray-600">{row.startTime}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.clockIn ? format(parseISO(row.clockIn), 'HH:mm') : '—'}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{row.endTime}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.clockOut ? format(parseISO(row.clockOut), 'HH:mm') : '—'}</td>
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
