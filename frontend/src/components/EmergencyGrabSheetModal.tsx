import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi } from '../api/serviceUsers';
import { shiftsApi } from '../api/shifts';
import { ServiceUser } from '../types';
import { format, differenceInYears, addDays } from 'date-fns';
import { formatTime12h } from '../lib/time';
import { settingsApi } from '../api/settings';
import PrintBrandingHeader from './PrintBrandingHeader';

// Minutes between two HH:mm times (handles overnight).
function durationMins(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

// Grab-sheet-specific fields (everything else auto-fills from the record).
interface GrabData {
  title?: string;
  socialServiceRef?: string;
  timeCritical?: 'YES' | 'NO' | '';
  agreedTimes?: string;
  medicalConditions?: string;
  allergies?: string;
  dietaryNeeds?: string;
  manualHandling?: string;
  communication?: string;
  dateCompleted?: string;
}

function parseGrab(json?: string): GrabData {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 border-b border-gray-300 last:border-0">
      <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">{label}</div>
      <div className="col-span-2 px-3 py-1.5 text-sm text-gray-900">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  );
}

export default function EmergencyGrabSheetModal({ serviceUser, canManage, onClose }: { serviceUser: ServiceUser; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const su = serviceUser;
  const [g, setG] = useState<GrabData>(() => parseGrab(su.grabSheet));
  const set = (k: keyof GrabData, v: string) => setG((p) => ({ ...p, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => serviceUsersApi.update(su.id, { grabSheet: JSON.stringify(g) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-user', su.id] }); onClose(); },
  });

  const age = su.dateOfBirth ? differenceInYears(new Date(), new Date(su.dateOfBirth)) : null;

  // Company identity for the ambulance-crew instruction line and letterhead.
  const { data: org } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60 * 1000 });
  const companyName = org?.companyName || 'the care office';

  // Derive the agreed calls from the actual schedule: pull the next two weeks of
  // this service user's shifts and collapse them to the distinct daily calls.
  const from = format(new Date(), 'yyyy-MM-dd');
  const to = format(addDays(new Date(), 13), 'yyyy-MM-dd');
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', 'grab', su.id],
    queryFn: () => shiftsApi.list({ serviceUserId: su.id, startDate: from, endDate: to }),
  });
  const activeShifts = shifts.filter((s) => s.status !== 'CANCELLED');
  const slotMap = new Map<string, { visitName?: string; startTime: string; endTime: string }>();
  const perDay = new Map<string, number>();
  for (const s of activeShifts) {
    const key = `${s.startTime}|${s.endTime}|${s.visitName || ''}`;
    if (!slotMap.has(key)) slotMap.set(key, { visitName: s.visitName, startTime: s.startTime, endTime: s.endTime });
    const day = String(s.date).slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const slots = [...slotMap.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  // "Calls a day" = the most common number of calls across days that have any.
  const dayCounts = [...perDay.values()];
  const modeCount = dayCounts.length
    ? [...dayCounts].sort((a, b) => dayCounts.filter((x) => x === b).length - dayCounts.filter((x) => x === a).length)[0]
    : 0;

  const field = (val: string | undefined, onChange: (v: string) => void, placeholder = '') =>
    canManage
      ? <textarea value={val || ''} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder} className="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-none focus:border-blue-500 focus:outline-none print:border-0 print:p-0" />
      : <span className="text-sm text-gray-900 whitespace-pre-wrap">{val || '—'}</span>;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-4 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
        {/* Toolbar (hidden when printing) */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10 no-print">
          <h2 className="text-lg font-semibold">Emergency Grab Sheet — {su.firstName} {su.lastName}</h2>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-secondary btn btn-sm">🖨 Print</button>
            {canManage && <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary btn btn-sm">{saveMut.isPending ? 'Saving…' : 'Save'}</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
          </div>
        </div>

        {/* Printable sheet */}
        <div className="grab-sheet-printable p-6 space-y-4 text-gray-900">
          {/* Company letterhead (also shown on screen as a preview) */}
          <PrintBrandingHeader />

          <div className="text-center border-2 border-gray-800 rounded-lg p-3">
            <h1 className="text-xl font-bold">AMBULANCE CREW</h1>
            <p className="text-xs mt-1">If admission to hospital is necessary, please take this document with you as it contains the relevant information you will require. <span className="font-semibold">Please leave the rest of the file at home.</span></p>
            <p className="text-xs mt-1">For discharge or further information, contact <span className="font-semibold">{companyName}</span>{org?.phone ? <> on <span className="font-semibold">{org.phone}</span></> : ''}.</p>
          </div>

          {/* Service User Information */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-1">Service User Information</h3>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <Row label="Title" value={su.title} />
              <Row label="Forename" value={su.firstName} />
              <Row label="Surname" value={su.lastName} />
              <Row label="Preferred Name" value={su.preferredName} />
              <div className="grid grid-cols-3 border-b border-gray-300">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Social Service Ref No.</div>
                <div className="col-span-2 px-3 py-1.5">
                  {canManage
                    ? <input value={g.socialServiceRef || ''} onChange={(e) => set('socialServiceRef', e.target.value)} className="w-full border border-gray-300 rounded px-2 py-0.5 text-sm print:border-0" />
                    : <span className="text-sm">{g.socialServiceRef || '—'}</span>}
                </div>
              </div>
              <Row label="Home Address" value={su.address} />
              <Row label="Postcode" value={su.postcode} />
              <Row label="Telephone Number" value={su.phone} />
              <Row label="Gender" value={su.gender} />
              <Row label="Ethnic Origin" value={su.ethnicOrigin} />
              <Row label="D.O.B" value={su.dateOfBirth ? `${format(new Date(su.dateOfBirth), 'dd MMM yyyy')}${age != null ? ` (${age} yrs)` : ''}` : undefined} />
              <Row label="Start Date" value={su.serviceStartDate ? format(new Date(su.serviceStartDate), 'dd MMM yyyy') : undefined} />
              <div className="grid grid-cols-3">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Date Completed</div>
                <div className="col-span-2 px-3 py-1.5">
                  {canManage
                    ? <input type="date" value={g.dateCompleted || ''} onChange={(e) => set('dateCompleted', e.target.value)} className="border border-gray-300 rounded px-2 py-0.5 text-sm print:border-0" />
                    : <span className="text-sm">{g.dateCompleted ? format(new Date(g.dateCompleted), 'dd MMM yyyy') : '—'}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* People */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-1">People</h3>
            <div className="border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-300">
              {[
                { role: 'Emergency Contact', name: su.emergencyContactName, rel: su.emergencyContactRelation, tel: su.emergencyContactPhone, mob: su.emergencyContactMobile },
                { role: 'Next of Kin', name: su.nextOfKinName, rel: su.nextOfKinRelation, tel: su.nextOfKinPhone, mob: su.nextOfKinMobile },
                { role: 'Pharmacist', name: su.pharmacyName, rel: '', tel: su.pharmacyPhone, mob: '' },
                { role: 'G.P.', name: su.gpName, rel: su.gpPractice, tel: su.gpPhone, mob: '' },
              ].map((p) => (
                <div key={p.role} className="px-3 py-2 text-sm">
                  <div className="font-semibold text-gray-700">{p.role}</div>
                  <div className="text-gray-800">
                    {[p.name, p.rel].filter(Boolean).join(' · ') || <span className="text-gray-300">—</span>}
                    {(p.tel || p.mob) && (
                      <span className="text-gray-600"> — {[p.tel ? `Tel: ${p.tel}` : null, p.mob ? `Mob: ${p.mob}` : null].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agreed Visits — pulled from the schedule */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-1">Agreed Visits</h3>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <Row label="No. of calls a day" value={modeCount ? `${modeCount} call${modeCount > 1 ? 's' : ''} a day` : undefined} />
              <div className="border-b border-gray-300">
                <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">Calls (from the schedule)</div>
                {slots.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No scheduled calls found for the next two weeks.</div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-200">
                      {slots.map((s, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-gray-800">{s.visitName || 'Call'}</td>
                          <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-right whitespace-nowrap">{durationMins(s.startTime, s.endTime)} mins</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="grid grid-cols-3 border-b border-gray-300">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Time critical?</div>
                <div className="col-span-2 px-3 py-1.5 text-sm">
                  {canManage ? (
                    <span className="flex gap-4">
                      {(['YES', 'NO'] as const).map((v) => (
                        <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="timeCritical" checked={g.timeCritical === v} onChange={() => set('timeCritical', v)} /> {v}
                        </label>
                      ))}
                    </span>
                  ) : (g.timeCritical || '—')}
                </div>
              </div>
              <div className="grid grid-cols-3">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Additional visit notes</div>
                <div className="col-span-2 px-3 py-1.5">{field(g.agreedTimes, (v) => set('agreedTimes', v), 'Anything extra about the calls (optional)')}</div>
              </div>
            </div>
          </div>

          {/* Other Information */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-1">Other Information</h3>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 border-b border-gray-300">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Medical Conditions</div>
                <div className="col-span-2 px-3 py-1.5">{field(g.medicalConditions, (v) => set('medicalConditions', v))}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-gray-300">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Allergies</div>
                <div className="col-span-2 px-3 py-1.5">{field(g.allergies, (v) => set('allergies', v))}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-gray-300">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Special Dietary Needs</div>
                <div className="col-span-2 px-3 py-1.5">{field(g.dietaryNeeds, (v) => set('dietaryNeeds', v))}</div>
              </div>
              <div className="grid grid-cols-3 border-b border-gray-300">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Manual Handling</div>
                <div className="col-span-2 px-3 py-1.5">{field(g.manualHandling, (v) => set('manualHandling', v))}</div>
              </div>
              <div className="grid grid-cols-3">
                <div className="col-span-1 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-r border-gray-300">Communication</div>
                <div className="col-span-2 px-3 py-1.5">{field(g.communication, (v) => set('communication', v))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
