import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { WorkItem } from '../api/supervision';

// The supervision worklist.
//
// It replaced three dead numbers and a flat list of 47 rows. The complaint it
// answers was "I cannot see what is overdue and pending — I have to look
// everywhere", and everywhere was literal: client documents were on this tab,
// spot checks on another, supervisions on a third. So:
//
//  - clients and staff are one list;
//  - the counts are the filter, not decoration;
//  - rows are grouped by PERSON, because one phone call to Aminah Hussain
//    clears four documents and four separate rows said otherwise;
//  - bands are by how late, so 336 days and 3 days stop looking the same.

type BandKey = 'CRITICAL' | 'OVERDUE' | 'WEEK' | 'SOON';

const BANDS: { key: BandKey; title: string; note: string; colour: string; chip: string }[] = [
  { key: 'CRITICAL', title: 'Overdue over 30 days', note: 'the ones found at inspection', colour: '#991b1b', chip: 'bg-red-100 text-red-800' },
  { key: 'OVERDUE', title: 'Overdue', note: 'up to 30 days late', colour: '#9a3412', chip: 'bg-orange-100 text-orange-800' },
  { key: 'WEEK', title: 'Due this week', note: 'next 7 days', colour: '#854d0f', chip: 'bg-amber-100 text-amber-800' },
  { key: 'SOON', title: 'Due in 30 days', note: 'plan these in', colour: '#1e40af', chip: 'bg-blue-100 text-blue-800' },
];

// Where an item sits. A record that was never made is as bad as it gets: there
// is no date to be late, and "no record at all" is the finding.
const CRITICAL_DAYS = 30;
function bandOf(item: WorkItem, today: Date): BandKey {
  if (item.never || !item.dueDate) return 'CRITICAL';
  const days = differenceInCalendarDays(today, new Date(item.dueDate));
  if (days > CRITICAL_DAYS) return 'CRITICAL';
  if (days > 0) return 'OVERDUE';
  if (days >= -7) return 'WEEK';
  return 'SOON';
}

function lateLabel(item: WorkItem, today: Date): string {
  if (item.never || !item.dueDate) return 'No record';
  const days = differenceInCalendarDays(today, new Date(item.dueDate));
  if (days > 0) return `${days}d late`;
  if (days === 0) return 'Due today';
  return `In ${Math.abs(days)}d`;
}

// What the office actually does next about this kind of thing.
function actionFor(kind: string): string {
  if (kind === 'Spot check') return 'Spot check';
  if (kind === 'Supervision') return 'Book supervision';
  return 'Start review';
}

type Group = { subjectId: string; subjectName: string; subjectType: 'CLIENT' | 'STAFF'; items: WorkItem[]; band: BandKey };

export default function SupervisionWorklist({ worklist }: { worklist: WorkItem[] }) {
  const today = useMemo(() => new Date(), []);
  const [band, setBand] = useState<BandKey | null>('CRITICAL');
  const [who, setWho] = useState<'ALL' | 'CLIENT' | 'STAFF'>('ALL');
  const [search, setSearch] = useState('');
  // Bands start collapsed past the first few people; 47 overdue items is a lot
  // of page and the point is to see the shape of it, not scroll it.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    const c: Record<BandKey, number> = { CRITICAL: 0, OVERDUE: 0, WEEK: 0, SOON: 0 };
    for (const i of worklist) c[bandOf(i, today)] += 1;
    return c;
  }, [worklist, today]);

  // One group per person per band. Somebody can legitimately be in two bands —
  // a document 200 days late and a review due next week — and merging those
  // into one card would bury the urgent half.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const item of worklist) {
      if (who !== 'ALL' && item.subjectType !== who) continue;
      if (q && !item.subjectName.toLowerCase().includes(q) && !item.kind.toLowerCase().includes(q)) continue;
      const b = bandOf(item, today);
      const key = `${b}__${item.subjectId}`;
      const found = map.get(key);
      if (found) found.items.push(item);
      else map.set(key, { subjectId: item.subjectId, subjectName: item.subjectName, subjectType: item.subjectType, items: [item], band: b });
    }
    return [...map.values()];
  }, [worklist, who, search, today]);

  const peopleTotal = useMemo(() => new Set(worklist.map((i) => i.subjectId)).size, [worklist]);
  const shownBands = band ? BANDS.filter((b) => b.key === band) : BANDS;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        {worklist.length} thing{worklist.length === 1 ? '' : 's'} need doing across {peopleTotal} {peopleTotal === 1 ? 'person' : 'people'}.
        Worst first — work down the page.
      </p>

      {/* The counts ARE the filter. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {BANDS.map((b) => {
          const on = band === b.key;
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={on}
              onClick={() => setBand(on ? null : b.key)}
              className={`text-left rounded-xl border p-3 transition-colors ${on ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
            >
              <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color: b.colour }}>{counts[b.key]}</div>
              <div className="text-xs font-medium text-gray-600 mt-0.5">{b.title}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white" role="group" aria-label="Filter by who">
          {([['ALL', 'Everyone'], ['CLIENT', 'Clients'], ['STAFF', 'Staff']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={who === v}
              onClick={() => setWho(v)}
              className={`px-3.5 py-1.5 text-[13px] font-medium border-r border-gray-200 last:border-r-0 ${who === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {band && (
          <button type="button" className="text-[13px] font-medium text-blue-700 hover:underline" onClick={() => setBand(null)}>
            Show every band
          </button>
        )}
        <div className="flex-1" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a name or document…"
          aria-label="Find a name or document"
          className="input max-w-[240px]"
        />
      </div>

      {groups.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          <p>Nothing outstanding here.</p>
        </div>
      )}

      {shownBands.map((b) => {
        const inBand = groups.filter((g) => g.band === b.key);
        if (inBand.length === 0) return null;
        const items = inBand.reduce((n, g) => n + g.items.length, 0);
        const open = expanded[b.key];
        const visible = open ? inBand : inBand.slice(0, 5);
        return (
          <section key={b.key}>
            <div className="flex items-baseline gap-2.5 mt-5 mb-2 px-0.5">
              <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: b.colour }}>{b.title}</h3>
              <span className="text-xs text-gray-600">
                {items} item{items === 1 ? '' : 's'} · {inBand.length} {inBand.length === 1 ? 'person' : 'people'} · {b.note}
              </span>
            </div>

            <div className="space-y-2.5">
              {visible.map((g) => (
                <div key={`${g.band}-${g.subjectId}`} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.colour }} aria-hidden="true" />
                        <h4 className="font-semibold text-gray-900">{g.subjectName}</h4>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${g.subjectType === 'STAFF' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
                          {g.subjectType === 'STAFF' ? 'Staff' : 'Client'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {g.items.length} {g.items.length === 1 ? 'item' : 'items'} · {lateLabel(g.items[0], today)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Link
                        to={g.subjectType === 'STAFF' ? `/users/${g.subjectId}` : `/service-users/${g.subjectId}`}
                        className="btn-secondary btn btn-sm whitespace-nowrap"
                      >
                        Open file
                      </Link>
                    </div>
                  </div>

                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 list-none p-0 m-0">
                    {g.items.map((it, i) => (
                      <li key={`${it.kind}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <span className="text-[13px] text-gray-800 truncate" title={it.kind}>{it.kind}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {it.dueDate && (
                            <span className="text-[11px] text-gray-500 tabular-nums hidden md:inline">{format(new Date(it.dueDate), 'd MMM yyyy')}</span>
                          )}
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${b.chip}`}>{lateLabel(it, today)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-xs text-gray-500 mt-2.5">{actionFor(g.items[0].kind)} — open the file to record it.</p>
                </div>
              ))}
            </div>

            {inBand.length > 5 && (
              <div className="text-center mt-2.5">
                <button
                  type="button"
                  className="btn-secondary btn btn-sm"
                  onClick={() => setExpanded((e) => ({ ...e, [b.key]: !e[b.key] }))}
                >
                  {open ? 'Show fewer' : `Show the other ${inBand.length - 5} ${inBand.length - 5 === 1 ? 'person' : 'people'}`}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
