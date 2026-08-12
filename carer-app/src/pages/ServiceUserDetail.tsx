import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { serviceUsersApi } from '../api/serviceUsers';
import { carePlansApi } from '../api/carePlans';
import { servicePlansApi } from '../api/servicePlans';
import { medicationsApi } from '../api/medications';
import { PSP_SECTIONS, itemKey } from '../lib/servicePlanSchema';
import type { PspItem, PspSection } from '../lib/servicePlanSchema';
import { formatTime12h } from '../lib/time';
import { mapsUrl } from '../lib/maps';

type Tab = 'info' | 'care' | 'service' | 'emar';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SLOTS = [
  { key: 'morning', label: 'Morning' }, { key: 'lunch', label: 'Lunch' },
  { key: 'tea', label: 'Tea' }, { key: 'bed', label: 'Bed' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  GIVEN: 'Administered', REFUSED: 'Refused', MISSED: 'Absent', NOT_NEEDED: 'Not Required', SELF_ADMIN: 'Self-admin', CANCELLED: 'Cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  GIVEN: 'text-green-700 bg-green-100', REFUSED: 'text-amber-700 bg-amber-100', MISSED: 'text-red-700 bg-red-100',
  NOT_NEEDED: 'text-gray-600 bg-gray-100', SELF_ADMIN: 'text-blue-700 bg-blue-100', CANCELLED: 'text-gray-600 bg-gray-100',
};

function Field({ label, value, href }: { label: string; value?: string | null; href?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-400">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline underline-offset-2 active:text-blue-800">{value}</a>
      ) : (
        <p className="text-sm text-gray-800">{value}</p>
      )}
    </div>
  );
}

export default function ServiceUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('info');
  const [pspSection, setPspSection] = useState(PSP_SECTIONS[0].id);

  const { data: su, isLoading } = useQuery({
    queryKey: ['service-user', id],
    queryFn: () => serviceUsersApi.get(id!),
    enabled: !!id,
  });

  const { data: carePlan } = useQuery({
    queryKey: ['care-plan', id],
    queryFn: () => carePlansApi.get(id!),
    enabled: !!id && tab === 'care',
  });

  const { data: servicePlan } = useQuery({
    queryKey: ['service-plan', id],
    queryFn: () => servicePlansApi.get(id!),
    enabled: !!id && tab === 'service',
  });

  const { data: medications = [] } = useQuery({
    queryKey: ['medications', id],
    queryFn: () => medicationsApi.list(id!),
    enabled: !!id && tab === 'emar',
  });

  const { data: administrations = [] } = useQuery({
    queryKey: ['med-admin', id, 'recent'],
    queryFn: () => medicationsApi.administrations(id!, format(new Date(Date.now() - 30 * 86400000), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd')),
    enabled: !!id && tab === 'emar',
  });

  if (isLoading || !su) {
    return (
      <Layout title="Client Details">
        <p className="text-center text-gray-400 py-8">Loading…</p>
      </Layout>
    );
  }

  let schedule: Partial<Record<string, Partial<Record<string, string>>>> = {};
  try { schedule = carePlan?.schedule ? JSON.parse(carePlan.schedule) : {}; } catch { schedule = {}; }

  let pspValues: Record<string, unknown> = {};
  try { pspValues = servicePlan?.data ? JSON.parse(servicePlan.data) : {}; } catch { pspValues = {}; }

  const currentSection = PSP_SECTIONS.find((s) => s.id === pspSection)!;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'care', label: 'Care Plan' },
    { key: 'service', label: 'Service Plan' },
    { key: 'emar', label: 'eMAR' },
  ];

  return (
    <Layout title={`${su.firstName} ${su.lastName}`}>
      <div className="space-y-4">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 font-medium">← Back</button>

        <div className="flex gap-1 bg-gray-200 p-1 rounded-xl overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-3">
            <Field label="Date of Birth" value={su.dateOfBirth ? format(new Date(su.dateOfBirth), 'dd MMM yyyy') : undefined} />
            <Field label="NHS Number" value={su.nhsNumber} />
            <Field label="Address" value={su.address ? `${su.address}${su.postcode ? `, ${su.postcode}` : ''}` : undefined} href={mapsUrl(su.address, su.postcode)} />
            <Field label="Phone" value={su.phone} />
            <Field label="Site" value={su.site?.name} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emergency Contact" value={su.emergencyContactName} />
              <Field label="Relation" value={su.emergencyContactRelation} />
            </div>
            <Field label="Emergency Phone" value={su.emergencyContactPhone} />
            <Field label="GP" value={[su.gpName, su.gpPractice].filter(Boolean).join(' · ') || undefined} />
            <Field label="GP Phone" value={su.gpPhone} />
            <Field label="Pharmacy" value={su.pharmacyName} />
            <Field label="Pharmacy Phone" value={su.pharmacyPhone} />
            <div className="flex flex-wrap gap-2 pt-1">
              {su.needsMedication && <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Medication</span>}
              {su.needsMobility && <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Mobility Support</span>}
              {su.needsPersonalCare && <span className="text-xs font-semibold bg-pink-100 text-pink-700 px-2 py-1 rounded-full">Personal Care</span>}
            </div>
            <Field label="Care Notes" value={su.careNotes} />
          </div>
        )}

        {tab === 'care' && (
          <div className="space-y-4">
            {!carePlan ? (
              <p className="text-center text-gray-400 py-8 text-sm">No care plan recorded yet</p>
            ) : (
              <>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 overflow-x-auto">
                  <h3 className="font-semibold text-gray-800 text-sm mb-2">Weekly Visit Profile</h3>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-1.5 border font-medium text-gray-500">Day</th>
                        {SLOTS.map((s) => <th key={s.key} className="text-left p-1.5 border font-medium text-gray-500">{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day) => (
                        <tr key={day}>
                          <td className="p-1.5 border font-medium text-gray-700">{day.slice(0, 3)}</td>
                          {SLOTS.map((s) => (
                            <td key={s.key} className="p-1.5 border text-gray-700">{schedule[day]?.[s.key] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-3">
                  <h3 className="font-semibold text-gray-800 text-sm">Tasks Required</h3>
                  <Field label="Morning" value={carePlan.tasksMorning} />
                  <Field label="Lunch" value={carePlan.tasksLunch} />
                  <Field label="Tea" value={carePlan.tasksTea} />
                  <Field label="Bed" value={carePlan.tasksBed} />
                  <Field label="Number of Carers" value={carePlan.numberOfCarers} />
                  <Field label="Care Package Info" value={carePlan.carePackageInfo} />
                  <Field label="Other Notes" value={carePlan.otherNotes} />
                  {carePlan.reviewDate && (
                    <Field label="Review Date" value={format(new Date(carePlan.reviewDate), 'dd MMM yyyy')} />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'service' && (
          <div className="space-y-3">
            {!servicePlan ? (
              <p className="text-center text-gray-400 py-8 text-sm">No service plan recorded yet</p>
            ) : (
              <>
                <select value={pspSection} onChange={(e) => setPspSection(e.target.value)} className="input text-sm w-full">
                  {PSP_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-900">{currentSection.title}</h3>
                  {currentSection.intro && <p className="text-xs text-gray-500 mt-1">{currentSection.intro}</p>}
                  <div className="mt-3">
                    {currentSection.items.map((item, i) => (
                      <PspItemView key={itemKey(currentSection.id, i)} section={currentSection} item={item} value={pspValues[itemKey(currentSection.id, i)]} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'emar' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-800 text-sm mb-2">Active Medications</h3>
              {medications.length === 0 ? (
                <p className="text-sm text-gray-400">No active medications</p>
              ) : (
                <div className="space-y-2">
                  {medications.map((m) => (
                    <div key={m.id} className="border border-gray-100 rounded-lg p-2.5">
                      <p className="text-sm font-medium text-gray-800">{m.name}{m.dose ? ` · ${m.dose}` : ''}</p>
                      <p className="text-xs text-gray-500">{m.route || 'Oral'}{m.instructions ? ` · ${m.instructions}` : ''}</p>
                      {(m.startDate || m.endDate) && (
                        <p className="text-xs text-purple-600 font-medium mt-0.5">
                          📅 Course{m.startDate ? ` from ${format(new Date(m.startDate), 'd MMM')}` : ''}{m.endDate ? ` until ${format(new Date(m.endDate), 'd MMM yyyy')}` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AddMedForm serviceUserId={id!} />

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-800 text-sm mb-2">Recent Administration (last 30 days)</h3>
              {administrations.length === 0 ? (
                <p className="text-sm text-gray-400">No records yet</p>
              ) : (
                <div className="space-y-2">
                  {administrations.map((a) => (
                    <div key={a.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.medication?.name}</p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(a.scheduledFor), 'dd MMM')} · {formatTime12h(format(new Date(a.scheduledFor), 'HH:mm'))}
                          {a.user && ` · ${a.user.firstName} ${a.user.lastName}`}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function PspItemView({ section, item, value }: { section: PspSection; item: PspItem; value: unknown }) {
  const type = item.type || 'yn';

  if (type === 'yn') {
    const v = (value as { v?: string; comment?: string; action?: string }) || {};
    return (
      <div className="py-2 border-b last:border-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-800 flex-1">{item.label}</span>
          <span className={`text-xs font-semibold ${v.v === 'YES' ? 'text-green-700' : v.v === 'NO' ? 'text-red-600' : 'text-gray-400'}`}>{v.v || '—'}</span>
        </div>
        {v.comment && <p className="text-xs text-gray-500 mt-0.5">Comment: {v.comment}</p>}
        {section.action && v.action && <p className="text-xs text-gray-500">Action: {v.action}</p>}
      </div>
    );
  }

  if (type === 'check') {
    const v = (value as { checked?: boolean; comment?: string }) || {};
    return (
      <div className="py-2 border-b last:border-0">
        <p className="text-sm text-gray-800">{v.checked ? '✓' : '☐'} {item.label}</p>
        {v.comment && <p className="text-xs text-gray-500 mt-0.5">Comment: {v.comment}</p>}
      </div>
    );
  }

  if (type === 'choice') {
    return (
      <div className="py-2 border-b last:border-0">
        <p className="text-sm text-gray-800">{item.label}</p>
        <p className="text-xs font-semibold text-gray-600 mt-0.5">{(value as string) || '—'}</p>
      </div>
    );
  }

  if (type === 'capability') {
    const v = (value as { independent?: boolean; supervise?: boolean; staff?: string; aid?: string }) || {};
    return (
      <div className="py-2 border-b last:border-0">
        <p className="text-sm text-gray-800">{item.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {[v.independent && 'Independent', v.supervise && 'Supervise', v.staff && `Staff: ${v.staff}`, v.aid && `Aid: ${v.aid}`].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
    );
  }

  if (type === 'signature') {
    const v = (value as { dataUrl?: string; name?: string; date?: string }) || {};
    return (
      <div className="py-2 border-b last:border-0">
        <p className="text-sm text-gray-800 mb-1">{item.label}</p>
        {v.dataUrl ? <img src={v.dataUrl} alt="signature" className="border rounded bg-white max-h-20" /> : <p className="text-xs text-gray-400">Not signed</p>}
        <p className="text-xs text-gray-500 mt-1">{[v.name, v.date].filter(Boolean).join(' · ')}</p>
      </div>
    );
  }

  if (type === 'mhEquipment') {
    const v = (value as Record<string, unknown>) || {};
    const checked = ['turnplate', 'slideSheet', 'handlingBelt', 'rotunder', 'other'].filter((k) => v[k]);
    return (
      <div className="py-2 border-b last:border-0">
        <p className="text-sm text-gray-800">{checked.length ? checked.join(', ') : '—'}</p>
        {(['hoistModel', 'bathHoistModel', 'standAidModel', 'otherDetail'] as const).map((k) =>
          v[k] ? <p key={k} className="text-xs text-gray-500">{String(v[k])}</p> : null
        )}
      </div>
    );
  }

  if (type === 'equipment') {
    const v = (value as Record<string, string>) || {};
    const hasAny = Object.values(v).some(Boolean);
    return (
      <div className="py-2 border-b last:border-0">
        <p className="text-sm font-medium text-gray-800">{item.label}</p>
        {hasAny ? (
          <p className="text-xs text-gray-500 mt-0.5">
            {[v.suppliedBy && `Supplied: ${v.suppliedBy}`, v.servicingBy && `Servicing: ${v.servicingBy}`, v.make && `Make: ${v.make}`, v.model && `Model: ${v.model}`].filter(Boolean).join(' · ')}
          </p>
        ) : <p className="text-xs text-gray-400">—</p>}
      </div>
    );
  }

  // text / longtext
  return (
    <div className="py-2 border-b last:border-0">
      <p className="text-sm text-gray-800">{item.label}</p>
      <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{(value as string) || '—'}</p>
    </div>
  );
}

// Lets a carer add a medication directly — mainly a short course a GP has
// prescribed (e.g. antibiotics for a week). Set an end date and it stops
// automatically. Leave dose times empty for an as-required (PRN) med.
function AddMedForm({ serviceUserId }: { serviceUserId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState({ name: '', dose: '', route: 'Oral', instructions: '', startDate: today, endDate: '' });
  const [times, setTimes] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const reset = () => { setForm({ name: '', dose: '', route: 'Oral', instructions: '', startDate: today, endDate: '' }); setTimes([]); setErr(''); };

  const saveMut = useMutation({
    mutationFn: () => medicationsApi.create({
      serviceUserId,
      name: form.name.trim(),
      dose: form.dose.trim() || undefined,
      route: form.route.trim() || undefined,
      instructions: form.instructions.trim() || undefined,
      times: times.map((t) => t.trim()).filter(Boolean).sort(),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['medications', serviceUserId] }); reset(); setOpen(false); },
    onError: () => setErr('Could not add the medication. Please try again.'),
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-blue-600 font-semibold text-sm">
        + Add a medication (short course)
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-3">
      <h3 className="font-semibold text-gray-800 text-sm">Add a medication</h3>
      <p className="text-xs text-gray-400 -mt-1">For a short course prescribed by the GP. Set an end date and it stops automatically.</p>

      <div>
        <label className="text-xs font-medium text-gray-500">Name *</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Amoxicillin" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Dose</label>
          <input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. 500mg" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Route</label>
          <input value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500">Instructions</label>
        <input value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. With food" />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500">Dose times</label>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {times.map((t, i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="time" value={t} onChange={(e) => setTimes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <button type="button" onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 text-lg leading-none px-1">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setTimes((prev) => [...prev, '09:00'])} className="text-sm text-blue-600 font-medium">+ Add time</button>
        </div>
        {times.length === 0 && <p className="text-xs text-gray-400 mt-1">No times — as required (PRN).</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500">Start date</label>
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">End date</label>
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setErr(''); saveMut.mutate(); }}
          disabled={!form.name.trim() || saveMut.isPending}
          className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40"
        >
          {saveMut.isPending ? 'Saving…' : 'Add medication'}
        </button>
        <button onClick={() => { reset(); setOpen(false); }} className="rounded-xl border border-gray-300 px-4 py-2.5 font-semibold text-gray-700 text-sm">Cancel</button>
      </div>
    </div>
  );
}
