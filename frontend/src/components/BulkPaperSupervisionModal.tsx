import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import { staffSupervisionApi, Supervision } from '../api/staffSupervision';
import { User } from '../types';
import AutoGrowTextarea from './AutoGrowTextarea';

/**
 * Seeding the supervision schedule for the whole staff group at once, from the
 * dates held in the paper files.
 *
 * PaperSupervisionModal does one person. Forty-two people one at a time is an
 * afternoon of clicking, and the thing being typed is a list that already
 * exists as a list - so this takes the list.
 *
 * Two rules it does not bend:
 *
 *  - A name matching no staff member, or more than one, is REPORTED, never
 *    guessed at. A supervision filed against the wrong carer is worse than one
 *    not filed at all, because it reads as done.
 *  - A date already recorded for that carer is skipped, so pressing Save twice
 *    cannot produce two of the same supervision.
 *
 * Nothing is written until the parsed rows have been looked at: the paste box
 * produces a table, and the table is what gets saved.
 */

type Status = 'add' | 'duplicate' | 'nomatch' | 'ambiguous' | 'baddate' | 'future';

interface Row {
  line: number;
  raw: string;
  name: string;
  dateText: string;
  date: string | null; // yyyy-MM-dd
  next: string | null;
  user: User | null;
  status: Status;
  detail?: string;
}

/** Tokens that say nothing about which person this is. */
const FILLER = /^(muhammad|mohammad|mohammed|md|m|mr|mrs|ms|miss)$/;

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLER.test(t));
}

/**
 * UK order, day first - "03.11.2025" is the third of November, which is how
 * every date in the staff files and the office tracker is written. An
 * ISO-looking value is taken as ISO.
 */
function parseDate(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/.exec(t);
  if (m) return iso(2000 + +m[3], +m[2], +m[1]);
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Name, then the date held, then optionally the next due date. */
function splitLine(line: string): string[] {
  return line.split(/\t|,|;|\s{2,}/).map((p) => p.trim()).filter(Boolean);
}

export default function BulkPaperSupervisionModal({
  staff,
  supervisions,
  onClose,
}: {
  staff: User[];
  supervisions: Supervision[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [assessorName, setAssessorName] = useState('');
  const [note, setNote] = useState('Recorded from the paper supervision in the staff file.');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ saved: number; failed: { name: string; why: string }[] } | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  // What is already on record, so a re-paste cannot double up.
  const held = useMemo(() => {
    const set = new Set<string>();
    for (const s of supervisions) set.add(`${s.userId}|${String(s.date).slice(0, 10)}`);
    return set;
  }, [supervisions]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    text.split(/\r?\n/).forEach((raw, i) => {
      if (!raw.trim()) return;
      const parts = splitLine(raw);
      const row: Row = {
        line: i + 1,
        raw,
        name: parts[0] || '',
        dateText: parts[1] || '',
        date: null,
        next: null,
        user: null,
        status: 'baddate',
      };

      // Match the name before anything else - an unmatched name is the error
      // worth showing, whatever the rest of the line says.
      const want = tokens(row.name);
      if (want.length) {
        const hits = staff.filter((u) => {
          const have = tokens(`${u.firstName} ${u.lastName}`);
          return want.every((w) => have.includes(w));
        });
        if (hits.length === 1) {
          row.user = hits[0];
        } else if (hits.length > 1) {
          row.status = 'ambiguous';
          row.detail = hits.map((u) => `${u.firstName} ${u.lastName}`).join(', ');
        } else {
          row.status = 'nomatch';
        }
      } else {
        row.status = 'nomatch';
      }

      if (row.user) {
        row.date = parseDate(row.dateText);
        if (!row.date) {
          row.status = 'baddate';
          row.detail = row.dateText ? `could not read "${row.dateText}"` : 'no date on this line';
        } else if (row.date > today) {
          row.status = 'future';
          row.detail = 'dated in the future';
        } else if (held.has(`${row.user.id}|${row.date}`)) {
          row.status = 'duplicate';
        } else {
          row.status = 'add';
          row.next = (parts[2] && parseDate(parts[2])) || format(addMonths(new Date(row.date), 3), 'yyyy-MM-dd');
        }
      }
      out.push(row);
    });
    return out;
  }, [text, staff, held, today]);

  const toAdd = rows.filter((r) => r.status === 'add');
  const dupes = rows.filter((r) => r.status === 'duplicate');
  const problems = rows.filter(
    (r) => r.status === 'nomatch' || r.status === 'ambiguous' || r.status === 'baddate' || r.status === 'future',
  );

  async function save() {
    setSaving(true);
    const failed: { name: string; why: string }[] = [];
    let saved = 0;
    // One at a time, so a single bad row cannot take the rest down with it.
    for (const r of toAdd) {
      try {
        await staffSupervisionApi.create({
          userId: r.user!.id,
          date: r.date!,
          nextReviewDate: r.next || undefined,
          assessorName: assessorName.trim() || undefined,
          note: note.trim() || undefined,
          source: 'paper',
        });
        saved += 1;
      } catch (e: any) {
        failed.push({
          name: `${r.user!.firstName} ${r.user!.lastName}`,
          why: e?.response?.data?.error || 'could not save',
        });
      }
    }
    qc.invalidateQueries({ queryKey: ['supervisions'] });
    qc.invalidateQueries({ queryKey: ['supervision-summary'] });
    qc.invalidateQueries({ queryKey: ['cqc-readiness'] });
    setSaving(false);
    setDone({ saved, failed });
  }

  const badge: Record<Status, { text: string; cls: string }> = {
    add: { text: 'will add', cls: 'bg-green-100 text-green-800' },
    duplicate: { text: 'already recorded', cls: 'bg-gray-100 text-gray-600' },
    nomatch: { text: 'no such staff member', cls: 'bg-red-100 text-red-800' },
    ambiguous: { text: 'matches more than one', cls: 'bg-red-100 text-red-800' },
    baddate: { text: 'date not readable', cls: 'bg-red-100 text-red-800' },
    future: { text: 'future date', cls: 'bg-red-100 text-red-800' },
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">Record previous supervisions in bulk</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        {done ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <p className="text-sm text-gray-800">
              <span className="font-semibold text-green-700">{done.saved}</span> supervision
              {done.saved === 1 ? '' : 's'} recorded.
              {dupes.length > 0 && <> {dupes.length} already on record and left alone.</>}
            </p>
            {done.failed.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium mb-1">{done.failed.length} did not save:</p>
                <ul className="list-disc list-inside">
                  {done.failed.map((f, i) => (
                    <li key={i}>
                      {f.name} &mdash; {f.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-gray-500">
              Each is now on the carer&apos;s record with the next supervision due three months later. Anything already
              past that date shows as overdue, which is the true position.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">
              One carer per line: <span className="font-mono">Name, date held</span> &mdash; and a third column for the
              next due date if it is not the usual three months. Dates read day-first, so 03.11.2025 is 3 November.
            </div>

            <div>
              <label className="label">Paste the list</label>
              <AutoGrowTextarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                minRows={6}
                placeholder={'Shama Aslam, 03.11.2025\nGurpreet Kaur, 04.11.2025'}
                className="input font-mono text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">
                  Supervisor / assessor <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  value={assessorName}
                  onChange={(e) => setAssessorName(e.target.value)}
                  placeholder="Who carried them out"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Note on every record</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
              </div>
            </div>

            {rows.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
                  <span className="font-medium text-gray-900">
                    {rows.length} line{rows.length === 1 ? '' : 's'} read
                  </span>
                  <span className="text-green-700">{toAdd.length} to add</span>
                  {dupes.length > 0 && <span className="text-gray-500">{dupes.length} already recorded</span>}
                  {problems.length > 0 && <span className="text-red-700 font-medium">{problems.length} need fixing</span>}
                </div>
                <div className="border rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Carer</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Date held</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Next due</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => (
                        <tr key={r.line} className={r.status === 'add' ? '' : 'bg-gray-50/60'}>
                          <td className="px-3 py-2">
                            {r.user ? (
                              `${r.user.firstName} ${r.user.lastName}`
                            ) : (
                              <span className="text-gray-500">{r.name || r.raw}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.date ? format(new Date(r.date), 'dd MMM yyyy') : <span className="text-gray-400">&mdash;</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.next ? format(new Date(r.next), 'dd MMM yyyy') : <span className="text-gray-400">&mdash;</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${badge[r.status].cls}`}>
                              {badge[r.status].text}
                            </span>
                            {r.detail && <span className="text-xs text-gray-500 ml-2">{r.detail}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {problems.length > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Lines needing a fix are skipped, not guessed at. Correct the name or the date above and they will
                    turn green.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} className="btn-secondary btn">
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button onClick={save} disabled={saving || toAdd.length === 0} className="btn-primary btn">
              {saving
                ? 'Saving…'
                : `Record ${toAdd.length || ''} supervision${toAdd.length === 1 ? '' : 's'}`.replace('  ', ' ')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
