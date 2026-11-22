import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { reportsApi } from '../api/reports';
import { formatTime12h } from '../lib/time';
import Icon from '../components/Icon';
import { format } from 'date-fns';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

// Somebody out once is a hair appointment. Somebody out again and again is a
// question, and the answer is rarely about medication — the call time has
// stopped suiting them, a relative is taking them out, or they are going out
// and nobody knows where. So the list is one row per person, ranked by how
// often, and the doses live underneath rather than the other way round.
export default function NotAtHome() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['not-at-home', days],
    queryFn: () => reportsApi.notAtHome(days),
  });

  const total = rows.reduce((n, r) => n + r.count, 0);
  const repeat = rows.filter((r) => r.count > 1).length;

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline mb-2">← Dashboard</button>
        <h1 className="text-2xl font-bold text-gray-900">Not at home</h1>
        <p className="text-sm text-gray-500">
          Visits where the carer attended and the client was out. These are not counted as missed medication —
          the service turned up — but somebody out repeatedly is worth a call.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 border-r border-gray-200 last:border-r-0 ${
                days === r.days ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {!isLoading && rows.length > 0 && (
          <span className="text-sm text-gray-500">
            {rows.length} client{rows.length === 1 ? '' : 's'} · {total} occasion{total === 1 ? '' : 's'}
            {repeat > 0 && <span className="text-amber-700 font-medium"> · {repeat} more than once</span>}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-gray-600 font-medium">Nobody was recorded as out in the last {days} days.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Service User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Times out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Most recent</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                // A keyed Fragment, not a bare <>: two rows per client, and an
                // unkeyed fragment in a list reconciles badly when the range changes.
                <Fragment key={r.serviceUserId}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setOpen((o) => ({ ...o, [r.serviceUserId]: !o[r.serviceUserId] }))}
                        className="flex items-center gap-1.5 font-medium text-gray-900"
                        title={`${r.count} occasion${r.count === 1 ? '' : 's'}`}
                      >
                        <Icon
                          name="chevron"
                          size={14}
                          className={`text-gray-400 shrink-0 transition-transform duration-150 ${open[r.serviceUserId] ? 'rotate-90' : ''}`}
                        />
                        {r.serviceUserName}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${r.count > 1 ? 'badge-yellow' : 'badge-gray'}`}>{r.count}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(r.lastAt), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/service-users/${r.serviceUserId}`} className="text-blue-600 hover:underline">
                        Open record
                      </Link>
                    </td>
                  </tr>
                  {open[r.serviceUserId] && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={4} className="px-4 py-3">
                        <table className="w-full text-xs">
                          <thead className="text-gray-500">
                            <tr>
                              <th className="text-left font-medium pb-1.5">Date</th>
                              <th className="text-left font-medium pb-1.5">Due</th>
                              <th className="text-left font-medium pb-1.5">Medication</th>
                              <th className="text-left font-medium pb-1.5">Carer</th>
                              <th className="text-left font-medium pb-1.5">Note</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700">
                            {r.occurrences.map((o) => (
                              <tr key={o.id}>
                                <td className="py-1 pr-4 whitespace-nowrap">{format(new Date(o.at), 'd MMM yyyy')}</td>
                                <td className="py-1 pr-4 whitespace-nowrap">{formatTime12h(o.doseTime)}</td>
                                <td className="py-1 pr-4">
                                  {o.medName}{o.medDose ? <span className="text-gray-400"> · {o.medDose}</span> : null}
                                </td>
                                <td className="py-1 pr-4">{o.carerName || <span className="text-gray-400">—</span>}</td>
                                <td className="py-1 text-gray-500">{o.note || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
