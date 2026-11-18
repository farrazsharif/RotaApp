import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chartsApi } from '../api/charts'
import type { ChartEntryInput } from '../api/charts'
import type { ChartKind } from '../lib/charts'
import {
  CHART_KINDS,
  FLUID_PRESETS,
  PORTIONS,
  POSITIONS,
  CONTINENCE_TYPES,
  STOOL_SCALE,
  SKIN_FINDINGS,
  BODY_SITES,
  parseCharts,
  chartMeta,
  skinIsAlarming,
} from '../lib/charts'

// Chart entry on a visit.
//
// Written for someone standing in a hallway with a phone in one hand. The
// common case is one tap to open and one to record - a mug of tea should not
// need a keyboard. Everything else is optional and below the fold.
//
// Today's totals come back from the server after each entry, because the
// number that matters to the next carer is what the person has had SO FAR,
// not what this carer just gave them.

const today = () => new Date().toISOString().slice(0, 10)

const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Could not save that. Check your signal and try again.'

export default function ChartQuickEntry({
  serviceUserId,
  shiftId,
  careCharts,
}: {
  serviceUserId: string
  shiftId?: string | null
  careCharts?: string | null
}) {
  const [open, setOpen] = useState<ChartKind | null>(null)
  const enabled = parseCharts(careCharts)

  const { data: day } = useQuery({
    queryKey: ['chart-day', serviceUserId, today()],
    queryFn: () => chartsApi.day(serviceUserId, today()),
    enabled: enabled.length > 0,
    staleTime: 30_000,
  })

  if (enabled.length === 0) return null

  const fluidPct = day?.totals.fluidTargetMl
    ? Math.min(100, Math.round((day.totals.fluidMl / day.totals.fluidTargetMl) * 100))
    : null

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">Charts</h3>
        {day && day.totals.concerns > 0 && (
          <span className="text-xs font-semibold text-red-700">
            {day.totals.concerns} flagged today
          </span>
        )}
      </div>

      {/* What the person has had so far today. The next carer's question. */}
      {day && (enabled.includes('FLUID') || enabled.includes('REPOSITION')) && (
        <div className="space-y-2">
          {enabled.includes('FLUID') && (
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-gray-600">Fluids today</span>
                <span className="font-semibold text-gray-900">
                  {day.totals.fluidMl} ml
                  {day.totals.fluidTargetMl ? <span className="text-gray-400"> / {day.totals.fluidTargetMl}</span> : null}
                </span>
              </div>
              {fluidPct !== null && (
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                  <div
                    className={`h-full rounded-full ${fluidPct < 70 ? 'bg-red-500' : fluidPct < 100 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${fluidPct}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {enabled.includes('REPOSITION') && (
            <p className="text-sm text-gray-600">
              Turns today: <span className="font-semibold text-gray-900">{day.totals.repositions}</span>
              {day.totals.longestGapMins !== null && (
                <span className="text-gray-400">
                  {' '}· longest gap {Math.floor(day.totals.longestGapMins / 60)}h {day.totals.longestGapMins % 60}m
                </span>
              )}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {CHART_KINDS.filter((c) => enabled.includes(c.key)).map((c) => (
          <button
            key={c.key}
            onClick={() => setOpen(c.key)}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-800 active:bg-gray-50"
          >
            <span className="text-lg">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {day && day.entries.length > 0 && (
        <details className="text-sm">
          <summary className="text-gray-500 cursor-pointer">Today so far ({day.entries.length})</summary>
          <div className="mt-2 space-y-1">
            {day.entries.map((e) => (
              <p key={e.id} className={`text-xs ${e.concern ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                <span className="tabular-nums font-semibold">
                  {new Date(e.occurredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {' '}{chartMeta(e.kind)?.label}
                {e.kind === 'FLUID' && !e.refused ? ` — ${e.amountMl ?? 0} ml` : ''}
                {e.refused ? ' — refused' : ''}
                {e.notes ? ` — ${e.notes}` : ''}
              </p>
            ))}
          </div>
        </details>
      )}

      {open && (
        <EntrySheet
          kind={open}
          serviceUserId={serviceUserId}
          shiftId={shiftId}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function EntrySheet({
  kind,
  serviceUserId,
  shiftId,
  onClose,
}: {
  kind: ChartKind
  serviceUserId: string
  shiftId?: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const meta = chartMeta(kind)
  const [form, setForm] = useState<ChartEntryInput>({ kind, shiftId: shiftId ?? null })
  const set = <K extends keyof ChartEntryInput>(k: K, v: ChartEntryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: (body: ChartEntryInput) => chartsApi.create(serviceUserId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chart-day', serviceUserId] })
      onClose()
    },
  })

  // One tap for the usual case.
  const quickFluid = (ml: number, label: string) =>
    save.mutate({ ...form, kind: 'FLUID', amountMl: ml, description: label })

  const ready =
    kind === 'FLUID' ? form.refused || !!form.amountMl
    : kind === 'FOOD' ? form.refused || !!form.portion
    : kind === 'REPOSITION' ? !!form.position
    : kind === 'CONTINENCE' ? !!form.continence
    : !!form.bodySite && !!form.skinFinding

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h3 className="font-semibold text-gray-900">{meta?.verb}</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none px-2">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {kind === 'FLUID' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {FLUID_PRESETS.map((p) => (
                  <button
                    key={p.ml}
                    disabled={save.isPending}
                    onClick={() => quickFluid(p.ml, p.label)}
                    className="rounded-xl border border-gray-200 px-3 py-3 text-sm active:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="block font-semibold text-gray-900">{p.ml} ml</span>
                    <span className="block text-xs text-gray-500">{p.label}</span>
                  </button>
                ))}
              </div>
              <Field label="Or type an amount (ml)">
                <input
                  type="number"
                  inputMode="numeric"
                  className="input"
                  value={form.amountMl ?? ''}
                  onChange={(e) => set('amountMl', e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
              <Field label="What it was">
                <input
                  className="input"
                  placeholder="Tea, water, squash…"
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </>
          )}

          {kind === 'FOOD' && (
            <>
              <Field label="What was offered">
                <input
                  className="input"
                  placeholder="Porridge, sandwich…"
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
              <Field label="How much they ate">
                <div className="grid grid-cols-5 gap-1.5">
                  {PORTIONS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => set('portion', form.portion === p.key ? null : p.key)}
                      className={`rounded-xl border py-3 text-sm font-semibold ${
                        form.portion === p.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {kind === 'REPOSITION' && (
            <Field label="Moved into">
              <div className="grid grid-cols-2 gap-2">
                {POSITIONS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => set('position', form.position === p.key ? null : p.key)}
                    className={`rounded-xl border px-3 py-3 text-sm font-medium ${
                      form.position === p.key
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {kind === 'CONTINENCE' && (
            <>
              <Field label="What happened">
                <div className="space-y-1.5">
                  {CONTINENCE_TYPES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => set('continence', form.continence === c.key ? null : c.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-sm font-medium text-left ${
                        form.continence === c.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </Field>
              {(form.continence === 'BOWEL' || form.continence === 'BOTH') && (
                <Field label="Stool type">
                  <select
                    className="input"
                    value={form.stoolScale ?? ''}
                    onChange={(e) => set('stoolScale', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">—</option>
                    {STOOL_SCALE.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={!!form.incontinent}
                  onChange={(e) => set('incontinent', e.target.checked)}
                />
                They were wet or soiled
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={!!form.padChanged}
                  onChange={(e) => set('padChanged', e.target.checked)}
                />
                Pad changed
              </label>
            </>
          )}

          {kind === 'SKIN' && (
            <>
              <Field label="Where">
                <select
                  className="input"
                  value={form.bodySite ?? ''}
                  onChange={(e) => set('bodySite', e.target.value || null)}
                >
                  <option value="">Choose…</option>
                  {BODY_SITES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="What you can see">
                <div className="space-y-1.5">
                  {SKIN_FINDINGS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => set('skinFinding', form.skinFinding === s.key ? null : s.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-sm font-medium text-left ${
                        form.skinFinding === s.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </Field>
              {skinIsAlarming(form.skinFinding) && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                  This is already pressure damage. Saving it tells the office straight away — ring them as
                  well if you are worried.
                </p>
              )}
            </>
          )}

          {(kind === 'FLUID' || kind === 'FOOD') && (
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={!!form.refused}
                onChange={(e) => set('refused', e.target.checked)}
              />
              They refused it
            </label>
          )}

          <Field label="Anything else">
            <textarea
              className="input"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>

          {kind !== 'SKIN' && (
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={!!form.concern}
                onChange={(e) => set('concern', e.target.checked)}
              />
              Flag this for the office
            </label>
          )}

          {save.isError && <p className="text-sm text-red-600">{err(save.error)}</p>}
        </div>

        <div className="p-4 border-t shrink-0 flex gap-2">
          <button className="flex-1 rounded-xl border border-gray-200 py-3 font-medium text-gray-700" onClick={onClose}>
            Cancel
          </button>
          <button
            className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-semibold disabled:opacity-50"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate(form)}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{label}</p>
      {children}
    </div>
  )
}
