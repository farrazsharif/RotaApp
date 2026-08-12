import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { medicationsApi } from '../api/medications';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser, Medication, MedStatus, BodyMapPoint } from '../types';
import { format } from 'date-fns';
import { formatTime12h } from '../lib/time';
import BodyMapPicker from './BodyMapPicker';

interface Props {
  serviceUser: ServiceUser;
  onClose: () => void;
  defaultShowAdd?: boolean;
}

const STATUS_OPTS: { value: MedStatus | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'GIVEN', label: 'Administered' },
  { value: 'REFUSED', label: 'Refused' },
  { value: 'MISSED', label: 'Absent' },
  { value: 'NOT_NEEDED', label: 'Not Required' },
  { value: 'SELF_ADMIN', label: 'Self-admin' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const statusClass: Record<string, string> = {
  GIVEN: 'bg-green-100 text-green-800 border-green-300',
  REFUSED: 'bg-amber-100 text-amber-800 border-amber-300',
  MISSED: 'bg-red-100 text-red-800 border-red-300',
  NOT_NEEDED: 'bg-gray-100 text-gray-600 border-gray-300',
  SELF_ADMIN: 'bg-blue-100 text-blue-800 border-blue-300',
  CANCELLED: 'bg-gray-100 text-gray-600 border-gray-300',
  '': 'bg-white text-gray-400 border-gray-300',
};

function parseTimes(times: string): string[] {
  try {
    const a = JSON.parse(times);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function parseSites(applicationSites: string): BodyMapPoint[] {
  try {
    const a = JSON.parse(applicationSites);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// Creams/lotions/ointments are applied to a specific body site, so those
// routes prompt the body map for marking where — anything else (oral,
// injection, etc.) doesn't need one.
function isTopical(route: string): boolean {
  return /cream|lotion|topical|ointment/i.test(route);
}

// Dose times are stored as the server's wall-clock time, encoded as if it
// were UTC (the server runs in UTC). Building this in the browser's local
// timezone instead would silently shift the match by the browser's UTC
// offset (e.g. an hour off during BST), so we must build it as UTC too.
function cellDate(dateStr: string, time: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi, 0));
}

// Weekday schedule. Numbers are JS getDay() values (0=Sun), shown Mon-first.
const WEEKDAYS: { n: number; label: string }[] = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
];
function parseDays(s?: string): number[] {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
// Empty OR all seven means "every day".
function isEveryDay(days: number[]): boolean {
  return days.length === 0 || days.length >= WEEKDAYS.length;
}
function daysLabel(days: number[]): string {
  if (isEveryDay(days)) return 'Every day';
  return WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => w.label).join(', ');
}
function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  // Default is every day, shown as all days ticked. Untick the days a med isn't
  // given. When all seven end up selected we store it as "every day" (empty).
  const selected = value.length === 0 ? WEEKDAYS.map((w) => w.n) : value;
  const toggle = (n: number) => {
    const next = selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n];
    onChange(next.length >= WEEKDAYS.length ? [] : next);
  };
  return (
    <div>
      <label className="label">Days of the week</label>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((w) => {
          const sel = selected.includes(w.n);
          return (
            <button
              key={w.n}
              type="button"
              onClick={() => toggle(w.n)}
              className={`px-2.5 py-1.5 rounded-lg border text-sm ${sel ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {w.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {isEveryDay(selected) ? 'Given every day. Untick the days it isn’t given — e.g. once a week (leave one) or specific days.' : `Given on: ${daysLabel(selected)}`}
      </p>
    </div>
  );
}

const emptyMed = { name: '', dose: '', route: 'Oral', instructions: '', isBlisterPack: false, packContents: '', startDate: '', endDate: '', daysOfWeek: [] as number[] };

// Default clock times offered for each visit type a service user can be
// scheduled for (see ServiceUserForm's VISIT_TYPES). Anything without
// a known default (e.g. a custom visit type) falls back to a blank time
// the manager fills in themselves.
// Sensible default dose time for a visit slot. Care-plan visit types are named
// like "Morning Call" / "Bed Call", so we match on the slot word regardless of
// the "Call" suffix, case, or minor wording — otherwise every visit fell back
// to 09:00 (so a morning + bed med saved as 09:00 and 09:00).
function defaultTimeForVisit(type: string): string {
  const t = type.toLowerCase().replace(/\s*call$/, '').trim();
  const map: Record<string, string> = {
    morning: '08:00', breakfast: '08:00', am: '08:00',
    lunch: '12:00', midday: '12:00', noon: '12:00',
    afternoon: '14:00', tea: '16:30', teatime: '16:30',
    evening: '18:30', bed: '21:00', night: '21:00', pm: '21:00',
    sitting: '14:00', cleaning: '10:00', shopping: '11:00',
    laundry: '11:00', domestic: '10:00', social: '14:00', 'pop in': '12:00',
  };
  return map[t] || '09:00';
}

function parseScheduledVisitTypes(visitsJson?: string): string[] {
  if (!visitsJson) return [];
  try {
    const arr = JSON.parse(visitsJson);
    if (!Array.isArray(arr)) return [];
    // De-dupe while preserving order — a service user can have more than
    // one visit of the same type (e.g. two "Sitting Call"s), but they only
    // need one dose-time slot for it.
    const seen = new Set<string>();
    const types: string[] = [];
    for (const v of arr) {
      const type = v && typeof v.type === 'string' ? v.type : null;
      if (type && !seen.has(type)) { seen.add(type); types.push(type); }
    }
    return types;
  } catch {
    return [];
  }
}

export default function EmarModal({ serviceUser, onClose, defaultShowAdd }: Props) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showAdd, setShowAdd] = useState(!!defaultShowAdd);
  const [medForm, setMedForm] = useState(emptyMed);
  const [visitTimes, setVisitTimes] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<BodyMapPoint[]>([]);
  const [viewingSitesFor, setViewingSitesFor] = useState<Medication | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Only offer dose times for visits this client is actually scheduled for;
  // fall back to the standard Morning/Lunch/Tea/Bed slots if their care
  // plan has no visits configured yet.
  const scheduledVisitTypes = parseScheduledVisitTypes(serviceUser.visits);
  const visitTimeOpts = (scheduledVisitTypes.length > 0 ? scheduledVisitTypes : ['Morning', 'Lunch', 'Tea', 'Bed'])
    .map((type) => ({ key: type, label: type, defaultTime: defaultTimeForVisit(type) }));

  function toggleVisit(key: string, defaultTime: string) {
    setVisitTimes((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = defaultTime;
      return next;
    });
  }

  const { data: meds = [] } = useQuery({
    queryKey: ['medications', serviceUser.id],
    queryFn: () => medicationsApi.list(serviceUser.id),
  });

  const { data: admins = [] } = useQuery({
    queryKey: ['med-admin', serviceUser.id, date],
    queryFn: () => medicationsApi.administrations(serviceUser.id, date),
  });

  const recordMut = useMutation({
    mutationFn: (v: { medicationId: string; scheduledFor: string; status: MedStatus }) =>
      medicationsApi.record({ medicationId: v.medicationId, serviceUserId: serviceUser.id, scheduledFor: v.scheduledFor, status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['med-admin', serviceUser.id, date] }),
  });

  const addMut = useMutation({
    mutationFn: () => medicationsApi.create({
      serviceUserId: serviceUser.id,
      name: medForm.name.trim(),
      dose: medForm.dose || undefined,
      route: medForm.route || undefined,
      instructions: medForm.instructions || undefined,
      isBlisterPack: medForm.isBlisterPack,
      packContents: medForm.isBlisterPack ? (medForm.packContents || undefined) : undefined,
      times: Object.values(visitTimes).sort(),
      daysOfWeek: medForm.daysOfWeek,
      applicationSites: isTopical(medForm.route) ? sites : undefined,
      startDate: medForm.startDate || undefined,
      endDate: medForm.endDate || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medications', serviceUser.id] });
      setMedForm(emptyMed);
      setVisitTimes({});
      setSites([]);
      setShowAdd(false);
    },
  });

  const discontinueMut = useMutation({
    mutationFn: (id: string) => medicationsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['medications', serviceUser.id] }); },
  });

  const adminFor = (medicationId: string, when: Date) =>
    admins.find((a) => a.medicationId === medicationId && new Date(a.scheduledFor).getTime() === when.getTime());

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold">eMAR — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">Medication Administration Record</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="label">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </div>
            {isManager && (
              <button className="btn-secondary btn ml-auto" onClick={() => setShowAdd((s) => !s)}>
                {showAdd ? 'Cancel' : '+ Add Medication'}
              </button>
            )}
          </div>

          {isManager && showAdd && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={medForm.isBlisterPack}
                  onChange={(e) => setMedForm({
                    ...medForm,
                    isBlisterPack: e.target.checked,
                    // Sensible default name when switching to a pack.
                    name: e.target.checked && !medForm.name.trim() ? 'Blister Pack (MDS)' : medForm.name,
                  })}
                  className="h-4 w-4 accent-blue-600"
                />
                💊 This is a blister pack (MDS / dosette) — given as a whole at each dose time
              </label>

              {medForm.isBlisterPack && (
                <div>
                  <label className="label">Medications in this pack</label>
                  <textarea
                    value={medForm.packContents}
                    onChange={(e) => setMedForm({ ...medForm, packContents: e.target.value })}
                    rows={3}
                    className="input resize-none"
                    placeholder={'List what the pack contains, e.g.\nAmlodipine 5mg — 1 tablet\nAtorvastatin 20mg — 1 tablet\nMetformin 500mg — 1 tablet'}
                  />
                  <p className="text-xs text-gray-400 mt-1">For the record — the carer administers the whole pack; this lists what’s inside.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{medForm.isBlisterPack ? 'Pack name *' : 'Medication Name *'}</label>
                  <input value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} className="input" placeholder={medForm.isBlisterPack ? 'e.g. Blister Pack (MDS)' : 'e.g. Amlodipine'} />
                </div>
                <div>
                  <label className="label">Dose</label>
                  <input value={medForm.dose} onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })} className="input" placeholder={medForm.isBlisterPack ? 'e.g. 1 pack' : 'e.g. 5mg, 1 tablet'} />
                </div>
                <div>
                  <label className="label">Route</label>
                  <input
                    value={medForm.route}
                    onChange={(e) => setMedForm({ ...medForm, route: e.target.value })}
                    className="input"
                    placeholder="Oral, Cream, Topical…"
                  />
                </div>
              </div>

              {isTopical(medForm.route) && (
                <div>
                  <label className="label">Where should it be applied?</label>
                  <BodyMapPicker value={sites} onChange={setSites} />
                  <p className="text-xs text-gray-400 mt-1">
                    Click on the diagrams to mark application site(s). Click a marker to remove it.
                  </p>
                </div>
              )}

              <div>
                <label className="label">Dose Times — select visits</label>
                <p className="text-xs text-gray-400 mb-1.5">
                  {scheduledVisitTypes.length > 0
                    ? `Synced to ${serviceUser.firstName.trim()}'s ${scheduledVisitTypes.length} scheduled visit${scheduledVisitTypes.length > 1 ? 's' : ''}.`
                    : 'No visits configured on this client’s care plan yet — showing standard visit times.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {visitTimeOpts.map((opt) => {
                    const selected = opt.key in visitTimes;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleVisit(opt.key, opt.defaultTime)}
                        className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
                          selected ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{opt.label}
                      </button>
                    );
                  })}
                </div>
                {Object.keys(visitTimes).length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No visit selected — leave empty for PRN / as-required medication.</p>
                )}
              </div>
              <div>
                <label className="label">Instructions</label>
                <input value={medForm.instructions} onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })} className="input" placeholder="e.g. With food" />
              </div>
              <WeekdayPicker value={medForm.daysOfWeek} onChange={(v) => setMedForm({ ...medForm, daysOfWeek: v })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="date" value={medForm.startDate} onChange={(e) => setMedForm({ ...medForm, startDate: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">End date <span className="text-gray-400 font-normal">(short course)</span></label>
                  <input type="date" value={medForm.endDate} onChange={(e) => setMedForm({ ...medForm, endDate: e.target.value })} className="input" />
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-1">Leave dates blank for an ongoing medication. Set an end date for a short course (e.g. a 10-day antibiotic) — it stops automatically after that day.</p>
              <div className="flex justify-end">
                <button className="btn-primary btn" disabled={!medForm.name.trim() || addMut.isPending} onClick={() => addMut.mutate()}>
                  {addMut.isPending ? 'Saving…' : 'Add Medication'}
                </button>
              </div>
            </div>
          )}

          {meds.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No active medications for this client</p>
          ) : (
            <div className="space-y-4">
              {meds.map((med: Medication) => {
                const times = parseTimes(med.times);
                const days = parseDays(med.daysOfWeek);
                // Weekday of the selected date (UTC, matching the server) — used
                // to hide dose slots on days a restricted med isn't due.
                const dueToday = days.length === 0 || days.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
                const medSites = parseSites(med.applicationSites);
                return (
                  <div key={med.id} className="rounded-lg border border-gray-200 p-3">
                    {editingId === med.id ? (
                      <MedEditRow med={med} serviceUserId={serviceUser.id} onDone={() => setEditingId(null)} />
                    ) : (
                    <>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                          {med.name} {med.dose && <span className="text-gray-500 font-normal">· {med.dose}</span>}
                          {med.isBlisterPack && <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">💊 Blister pack</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {med.route || 'Oral'}{med.instructions ? ` · ${med.instructions}` : ''}
                        </p>
                        {(med.startDate || med.endDate) && (
                          <p className="text-xs text-purple-600 font-medium mt-0.5">
                            📅 Course{med.startDate ? ` from ${format(new Date(med.startDate), 'd MMM')}` : ''}{med.endDate ? ` until ${format(new Date(med.endDate), 'd MMM yyyy')}` : ''}
                          </p>
                        )}
                        {days.length > 0 && days.length < WEEKDAYS.length && (
                          <p className="text-xs text-blue-600 font-medium mt-0.5">📆 {daysLabel(days)} only</p>
                        )}
                        {med.isBlisterPack && med.packContents && (
                          <div className="mt-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded p-2 whitespace-pre-wrap">
                            <span className="font-medium text-gray-500">Contains:</span>{'\n'}{med.packContents}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {medSites.length > 0 && (
                          <button className="text-xs text-blue-600 hover:underline" onClick={() => setViewingSitesFor(med)}>
                            🗺 Body Map ({medSites.length})
                          </button>
                        )}
                        {isManager && (
                          <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditingId(med.id)}>
                            Edit
                          </button>
                        )}
                        {isManager && (
                          <button className="text-xs text-red-600 hover:underline" onClick={() => discontinueMut.mutate(med.id)}>
                            Discontinue
                          </button>
                        )}
                      </div>
                    </div>

                    {times.length === 0 ? (
                      <p className="text-xs text-amber-600 mt-2">No dose times set (PRN / as required)</p>
                    ) : !dueToday ? (
                      <p className="text-xs text-gray-400 mt-2">Not scheduled on this day — given {daysLabel(days)} only.</p>
                    ) : (
                      <div className="flex flex-wrap gap-3 mt-3">
                        {times.map((t) => {
                          const when = cellDate(date, t);
                          const rec = adminFor(med.id, when);
                          const status = rec?.status || '';
                          return (
                            <div key={t} className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-gray-700">{formatTime12h(t)}</span>
                              <select
                                value={status}
                                onChange={(e) => recordMut.mutate({ medicationId: med.id, scheduledFor: when.toISOString(), status: e.target.value as MedStatus })}
                                className={`text-xs rounded-md border px-2 py-1 ${statusClass[status]}`}
                              >
                                {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              {rec?.user && (
                                <span className="text-[10px] text-gray-400">
                                  {rec.user.firstName} {rec.user.lastName[0]}
                                  {rec.recordedAt && ` · ${format(new Date(rec.recordedAt), 'h:mm a')}`}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {viewingSitesFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setViewingSitesFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Application Sites — {viewingSitesFor.name}</h3>
              <button onClick={() => setViewingSitesFor(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <BodyMapPicker value={parseSites(viewingSitesFor.applicationSites)} onChange={() => {}} readOnly />
          </div>
        </div>
      )}
    </div>
  );
}

// Inline editor for an existing medication — mainly to change dose times (e.g.
// when the council changes a call time) but also name/dose/route/instructions
// and pack contents. Application sites are left untouched (not sent), so body
// maps aren't wiped by an edit.
function MedEditRow({ med, serviceUserId, onDone }: { med: Medication; serviceUserId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: med.name,
    dose: med.dose || '',
    route: med.route || 'Oral',
    instructions: med.instructions || '',
    isBlisterPack: !!med.isBlisterPack,
    packContents: med.packContents || '',
    startDate: med.startDate ? med.startDate.slice(0, 10) : '',
    endDate: med.endDate ? med.endDate.slice(0, 10) : '',
  });
  const [times, setTimes] = useState<string[]>(parseTimes(med.times));
  const [days, setDays] = useState<number[]>(parseDays(med.daysOfWeek));

  const saveMut = useMutation({
    mutationFn: () => medicationsApi.update(med.id, {
      name: form.name.trim(),
      dose: form.dose.trim(),
      route: form.route.trim(),
      instructions: form.instructions.trim(),
      isBlisterPack: form.isBlisterPack,
      packContents: form.isBlisterPack ? form.packContents.trim() : '',
      times: times.map((t) => t.trim()).filter(Boolean).sort(),
      daysOfWeek: days,
      startDate: form.startDate || '',
      endDate: form.endDate || '',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['medications', serviceUserId] }); onDone(); },
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Editing medication</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{form.isBlisterPack ? 'Pack name *' : 'Medication Name *'}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Dose</label>
          <input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Route</label>
          <input value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">Instructions</label>
          <input value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="input" placeholder="e.g. With food" />
        </div>
      </div>

      {form.isBlisterPack && (
        <div>
          <label className="label">Medications in this pack</label>
          <textarea value={form.packContents} onChange={(e) => setForm({ ...form, packContents: e.target.value })} rows={3} className="input resize-none" />
        </div>
      )}

      <div>
        <label className="label">Dose times</label>
        <div className="flex flex-wrap items-center gap-2">
          {times.map((t, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="time"
                value={t}
                onChange={(e) => setTimes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                className="input w-32"
              />
              <button type="button" onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-lg leading-none px-1" title="Remove time">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setTimes((prev) => [...prev, '09:00'])} className="text-sm text-blue-600 hover:underline">+ Add time</button>
        </div>
        {times.length === 0 && <p className="text-xs text-gray-400 mt-1">No times — this medication is PRN / as required.</p>}
      </div>

      <WeekdayPicker value={days} onChange={setDays} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Start date</label>
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">End date <span className="text-gray-400 font-normal">(short course)</span></label>
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-secondary btn" onClick={onDone}>Cancel</button>
        <button className="btn-primary btn" disabled={!form.name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
