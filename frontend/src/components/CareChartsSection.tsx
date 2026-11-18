import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  chartsApi,
  ChartEntry,
  ChartKind,
  CHART_KINDS,
  parseCharts,
  chartShort,
  portionLabel,
  positionLabel,
  continenceLabel,
  skinLabel,
  skinIsAlarming,
} from '../api/charts';
import { serviceUsersApi } from '../api/serviceUsers';

// The daily charts, as the office reads them: one day at a time, with the
// arithmetic already done. A list of drinks tells a manager nothing. "640ml
// of a 1500ml target" tells them to pick up the phone.

const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'That did not save. Please try again.';

const hhmm = (iso: string) => format(new Date(iso), 'HH:mm');

export default function CareChartsSection({
  serviceUserId,
  careCharts,
  fluidTargetMl,
  repositionHours,
  canEdit,
}: {
  serviceUserId: string;
  careCharts?: string | null;
  fluidTargetMl?: number | null;
  repositionHours?: number | null;
  canEdit: boolean;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settingUp, setSettingUp] = useState(false);

  const enabled = parseCharts(careCharts);

  const { data: day, isLoading } = useQuery({
    queryKey: ['charts', serviceUserId, date],
    queryFn: () => chartsApi.day(serviceUserId, date),
    enabled: enabled.length > 0,
  });

  return (
    <div id="doc-care-charts" className="card p-4 space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Daily Charts</h2>
          <p className="text-xs text-gray-500">
            {enabled.length === 0
              ? 'None switched on. Turn on only what this person actually needs.'
              : enabled.map(chartShort).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enabled.length > 0 && (
            <input
              type="date"
              className="input text-sm py-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
          {canEdit && (
            <button className="btn-secondary btn btn-sm" onClick={() => setSettingUp(true)}>
              Set up
            </button>
          )}
        </div>
      </div>

      {enabled.length === 0 ? (
        <p className="text-sm text-gray-400">
          A chart nobody needs gets filled in without being read. Switch these on for the people whose
          risk assessments call for them.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !day ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {enabled.includes('FLUID') && (
              <Tile
                label="Fluids"
                value={`${day.totals.fluidMl} ml`}
                sub={
                  day.totals.fluidTargetMl
                    ? `of ${day.totals.fluidTargetMl} ml`
                    : 'no target set'
                }
                tone={
                  day.totals.fluidTargetMl && day.totals.fluidMl < day.totals.fluidTargetMl * 0.7
                    ? 'bad'
                    : day.totals.fluidTargetMl && day.totals.fluidMl < day.totals.fluidTargetMl
                      ? 'warn'
                      : 'ok'
                }
              />
            )}
            {enabled.includes('FOOD') && (
              <Tile
                label="Meals"
                value={String(day.totals.foodOffered)}
                sub={day.totals.foodRefused ? `${day.totals.foodRefused} refused` : 'none refused'}
                tone={day.totals.foodRefused > 0 ? 'warn' : 'ok'}
              />
            )}
            {enabled.includes('REPOSITION') && (
              <Tile
                label="Turns"
                value={String(day.totals.repositions)}
                sub={
                  day.totals.longestGapMins === null
                    ? 'no gap to measure'
                    : `longest gap ${Math.floor(day.totals.longestGapMins / 60)}h ${day.totals.longestGapMins % 60}m`
                }
                tone={
                  day.totals.repositionHours && day.totals.longestGapMins !== null
                    && day.totals.longestGapMins > day.totals.repositionHours * 60
                    ? 'bad'
                    : 'ok'
                }
              />
            )}
            {enabled.includes('CONTINENCE') && (
              <Tile
                label="Episodes"
                value={String(day.totals.continenceEpisodes)}
                sub="incontinence"
                tone={day.totals.continenceEpisodes > 2 ? 'warn' : 'ok'}
              />
            )}
            {day.totals.concerns > 0 && (
              <Tile label="Flagged" value={String(day.totals.concerns)} sub="need a look" tone="bad" />
            )}
          </div>

          {day.entries.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing recorded on this day.</p>
          ) : (
            <div className="space-y-1.5">
              {day.entries.map((e) => (
                <EntryRow key={e.id} entry={e} canEdit={canEdit} serviceUserId={serviceUserId} date={date} />
              ))}
            </div>
          )}
        </>
      )}

      {settingUp && (
        <SetupModal
          serviceUserId={serviceUserId}
          enabled={enabled}
          fluidTargetMl={fluidTargetMl ?? null}
          repositionHours={repositionHours ?? null}
          onClose={() => setSettingUp(false)}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'ok' | 'warn' | 'bad';
}) {
  const ring =
    tone === 'bad' ? 'border-red-200 bg-red-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200';
  const text = tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900';
  return (
    <div className={`rounded-lg border p-2 ${ring}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-lg font-semibold leading-tight ${text}`}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

// One line per entry. What it says depends entirely on the kind, which is the
// whole reason these live in one table.
function describe(e: ChartEntry): string {
  if (e.kind === 'FLUID') {
    if (e.refused) return `Refused${e.description ? ` ${e.description}` : ' a drink'}`;
    return `${e.amountMl ?? 0} ml${e.description ? ` · ${e.description}` : ''}`;
  }
  if (e.kind === 'FOOD') {
    if (e.refused) return `Refused${e.description ? ` ${e.description}` : ' food'}`;
    return `${e.description || 'Meal'}${portionLabel(e.portion) ? ` · ate ${portionLabel(e.portion)!.toLowerCase()}` : ''}`;
  }
  if (e.kind === 'REPOSITION') {
    return `Moved to ${positionLabel(e.position)?.toLowerCase() || 'a new position'}`;
  }
  if (e.kind === 'CONTINENCE') {
    const bits = [continenceLabel(e.continence) || 'Continence'];
    if (e.stoolScale) bits.push(`type ${e.stoolScale}`);
    if (e.incontinent) bits.push('incontinent');
    if (e.padChanged) bits.push('pad changed');
    return bits.join(' · ');
  }
  return `${e.bodySite || 'Skin'} — ${skinLabel(e.skinFinding)?.toLowerCase() || 'checked'}`;
}

function EntryRow({
  entry,
  canEdit,
  serviceUserId,
  date,
}: {
  entry: ChartEntry;
  canEdit: boolean;
  serviceUserId: string;
  date: string;
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => chartsApi.remove(entry.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['charts', serviceUserId, date] }),
  });

  const alarming = entry.concern || skinIsAlarming(entry.skinFinding);

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border px-2.5 py-1.5 ${
        alarming ? 'border-red-200 bg-red-50' : 'border-gray-200'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm text-gray-800">
          <span className="font-semibold tabular-nums">{hhmm(entry.occurredAt)}</span>
          <span className="ml-2 badge bg-gray-100 text-gray-600 text-[10px]">{chartShort(entry.kind)}</span>
          <span className="ml-2">{describe(entry)}</span>
        </p>
        {entry.notes && <p className="text-xs text-gray-600 whitespace-pre-wrap">{entry.notes}</p>}
        <p className="text-xs text-gray-400">
          {entry.recordedBy ? `${entry.recordedBy.firstName} ${entry.recordedBy.lastName}` : 'Unknown'}
        </p>
      </div>
      {canEdit && (
        <button
          className="text-xs text-gray-400 hover:text-red-600 shrink-0"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm('Delete this entry? A chart entry is part of the care record.')) remove.mutate();
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}

function SetupModal({
  serviceUserId,
  enabled,
  fluidTargetMl,
  repositionHours,
  onClose,
}: {
  serviceUserId: string;
  enabled: ChartKind[];
  fluidTargetMl: number | null;
  repositionHours: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [charts, setCharts] = useState<ChartKind[]>(enabled);
  const [fluid, setFluid] = useState(fluidTargetMl ? String(fluidTargetMl) : '');
  const [hours, setHours] = useState(repositionHours ? String(repositionHours) : '');

  const save = useMutation({
    mutationFn: () =>
      serviceUsersApi.update(serviceUserId, {
        careCharts: charts,
        fluidTargetMl: fluid ? Number(fluid) : null,
        repositionHours: hours ? Number(hours) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serviceUser', serviceUserId] });
      qc.invalidateQueries({ queryKey: ['charts', serviceUserId] });
      onClose();
    },
  });

  const toggle = (k: ChartKind) =>
    setCharts((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-6 sm:my-0">
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Daily charts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Switch on only what this person needs. Each one you turn on appears for the carer on every visit,
            and a chart that gets filled in without being read is worse than no chart at all.
          </p>

          <div className="space-y-2">
            {CHART_KINDS.map((c) => (
              <label key={c.key} className="flex items-start gap-2.5 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={charts.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
                <span>
                  {c.label}
                  <span className="block text-xs text-gray-500">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {charts.includes('FLUID') && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                Daily fluid target (ml)
              </p>
              <input
                type="number"
                className="input"
                placeholder="e.g. 1500"
                value={fluid}
                onChange={(e) => setFluid(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                Without one, a fluid chart is a column of numbers nobody can call good or bad.
              </p>
            </div>
          )}

          {charts.includes('REPOSITION') && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                Reposition at least every (hours)
              </p>
              <input
                type="number"
                className="input"
                placeholder="e.g. 4"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          )}

          {save.isError && <p className="text-sm text-red-600">{err(save.error)}</p>}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
            <button className="btn-primary btn" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
