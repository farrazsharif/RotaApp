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
  { value: 'GIVEN', label: 'Given' },
  { value: 'REFUSED', label: 'Refused' },
  { value: 'MISSED', label: 'Missed' },
  { value: 'NOT_NEEDED', label: 'Not needed' },
  { value: 'SELF_ADMIN', label: 'Self-admin' },
];

const statusClass: Record<string, string> = {
  GIVEN: 'bg-green-100 text-green-800 border-green-300',
  REFUSED: 'bg-amber-100 text-amber-800 border-amber-300',
  MISSED: 'bg-red-100 text-red-800 border-red-300',
  NOT_NEEDED: 'bg-gray-100 text-gray-600 border-gray-300',
  SELF_ADMIN: 'bg-blue-100 text-blue-800 border-blue-300',
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

const emptyMed = { name: '', dose: '', route: 'Oral', instructions: '' };

const VISIT_TIME_OPTS: { key: string; label: string; defaultTime: string }[] = [
  { key: 'Morning', label: 'Morning', defaultTime: '08:00' },
  { key: 'Lunch', label: 'Lunch', defaultTime: '12:00' },
  { key: 'Tea', label: 'Tea', defaultTime: '16:30' },
  { key: 'Bed', label: 'Bed', defaultTime: '21:00' },
];

export default function EmarModal({ serviceUser, onClose, defaultShowAdd }: Props) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showAdd, setShowAdd] = useState(!!defaultShowAdd);
  const [medForm, setMedForm] = useState(emptyMed);
  const [visitTimes, setVisitTimes] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<BodyMapPoint[]>([]);
  const [viewingSitesFor, setViewingSitesFor] = useState<Medication | null>(null);

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
      times: Object.values(visitTimes).sort(),
      applicationSites: isTopical(medForm.route) ? sites : undefined,
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Medication Name *</label>
                  <input value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} className="input" placeholder="e.g. Amlodipine" />
                </div>
                <div>
                  <label className="label">Dose</label>
                  <input value={medForm.dose} onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })} className="input" placeholder="e.g. 5mg, 1 tablet" />
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
                <div className="flex flex-wrap gap-2">
                  {VISIT_TIME_OPTS.map((opt) => {
                    const selected = opt.key in visitTimes;
                    return (
                      <div
                        key={opt.key}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                          selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleVisit(opt.key, opt.defaultTime)}
                          className={`text-sm font-medium ${selected ? 'text-blue-700' : 'text-gray-600'}`}
                        >
                          {selected ? '✓ ' : ''}{opt.label}
                        </button>
                        {selected && (
                          <input
                            type="time"
                            value={visitTimes[opt.key]}
                            onChange={(e) => setVisitTimes((prev) => ({ ...prev, [opt.key]: e.target.value }))}
                            className="text-sm border border-gray-300 rounded px-1.5 py-0.5"
                          />
                        )}
                      </div>
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
                const medSites = parseSites(med.applicationSites);
                return (
                  <div key={med.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {med.name} {med.dose && <span className="text-gray-500 font-normal">· {med.dose}</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {med.route || 'Oral'}{med.instructions ? ` · ${med.instructions}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {medSites.length > 0 && (
                          <button className="text-xs text-blue-600 hover:underline" onClick={() => setViewingSitesFor(med)}>
                            🗺 Body Map ({medSites.length})
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
