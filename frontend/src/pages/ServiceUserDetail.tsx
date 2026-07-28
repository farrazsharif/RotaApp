import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi } from '../api/serviceUsers';
import { ServiceUserStatus, ServiceUser, Medication } from '../types';
import { carePlansApi } from '../api/carePlans';
import { servicePlansApi } from '../api/servicePlans';
import { medicationsApi } from '../api/medications';
import { callLogsApi } from '../api/callLogs';
import { respiteApi, type RespitePeriod } from '../api/respite';
import { useAuth } from '../contexts/AuthContext';
import { format, differenceInYears, addDays } from 'date-fns';
import HospitalIcon from '../components/HospitalIcon';
import Avatar from '../components/Avatar';
import { parseCategories } from '../lib/supportCategories';
import CarePlanModal from '../components/CarePlanModal';
import LikesDislikesModal from '../components/LikesDislikesModal';
import { likesDislikesApi } from '../api/likesDislikes';
import PersonalServicePlanModal from '../components/PersonalServicePlanModal';
import EmarModal from '../components/EmarModal';
import MarChartModal from '../components/MarChartModal';
import CallLogsModal from '../components/CallLogsModal';
import FamilyAccessModal from '../components/FamilyAccessModal';
import EmergencyGrabSheetModal from '../components/EmergencyGrabSheetModal';
import DocumentsTab from '../components/DocumentsTab';
import ServiceUserNotes from '../components/ServiceUserNotes';
import RespiteSection from '../components/RespiteSection';

const durationLabel = (m: number) =>
  m >= 60 ? `${m / 60} hr${m > 60 ? 's' : ''}${m % 60 ? ` ${m % 60}m` : ''}` : `${m} mins`;

function parseTimes(times: string): string[] {
  try {
    const a = JSON.parse(times);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

const STATUS_META: Record<ServiceUserStatus, { label: string; icon: string; className: string }> = {
  ACTIVE: { label: 'Active', icon: '🟢', className: 'bg-green-100 text-green-700' },
  ON_HOLD: { label: 'On Hold', icon: '⏸️', className: 'bg-gray-200 text-gray-700' },
  HOSPITALISED: { label: 'Hospitalised', icon: '', className: 'bg-amber-100 text-amber-700' },
  DISCHARGED: { label: 'Discharged', icon: '↩️', className: 'bg-blue-100 text-blue-700' },
  DECEASED: { label: 'Passed Away', icon: '⚪', className: 'bg-slate-300 text-slate-800' },
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800">{value || <span className="text-gray-400">—</span>}</p>
    </div>
  );
}

export default function ServiceUserDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [carePlanOpen, setCarePlanOpen] = useState(false);
  const [likesDislikesOpen, setLikesDislikesOpen] = useState(false);
  const [servicePlanOpen, setServicePlanOpen] = useState(false);
  const [emarOpen, setEmarOpen] = useState(false);
  const [marChartOpen, setMarChartOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [familyAccessOpen, setFamilyAccessOpen] = useState(false);
  const [grabSheetOpen, setGrabSheetOpen] = useState(false);
  // A status change the manager has selected but not yet confirmed — lets them
  // set (or back-date) when it takes effect before it's applied.
  const [pendingStatus, setPendingStatus] = useState<ServiceUserStatus | null>(null);
  const [effectiveAt, setEffectiveAt] = useState('');
  const [hospitalReturn, setHospitalReturn] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: su, isLoading, isError } = useQuery({
    queryKey: ['service-user', id],
    queryFn: () => serviceUsersApi.get(id),
    enabled: !!id,
  });

  // postcodes.io is a free, CORS-enabled UK postcode lookup — used instead of
  // Google's unauthenticated maps embed, which frequently returns a blank
  // iframe without an API key.
  const { data: geo } = useQuery({
    queryKey: ['postcode-geo', su?.postcode],
    queryFn: async () => {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(su!.postcode!.replace(/\s+/g, ''))}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.result ? { lat: json.result.latitude as number, lon: json.result.longitude as number } : null;
    },
    enabled: !!su?.postcode,
    staleTime: Infinity,
  });

  const { data: carePlan } = useQuery({ queryKey: ['care-plan', id], queryFn: () => carePlansApi.get(id), enabled: !!id });
  const { data: likesDislikes } = useQuery({ queryKey: ['likes-dislikes', id], queryFn: () => likesDislikesApi.get(id), enabled: !!id });
  const { data: servicePlan } = useQuery({ queryKey: ['service-plan', id], queryFn: () => servicePlansApi.get(id), enabled: !!id });
  const { data: meds = [] } = useQuery({ queryKey: ['medications', id], queryFn: () => medicationsApi.list(id), enabled: !!id });
  const { data: logs = [] } = useQuery({ queryKey: ['call-logs', id], queryFn: () => callLogsApi.list(id), enabled: !!id });
  const { data: respitePeriods = [] } = useQuery({ queryKey: ['respite', id], queryFn: () => respiteApi.list(id), enabled: !!id });
  // A respite window covering "now" — shown as a pill in the header.
  const activeRespite = respitePeriods.find((p) => {
    const t = Date.now();
    return p.type !== 'HOSPITAL' && t >= new Date(p.startAt).getTime() && t < new Date(p.endAt).getTime();
  });
  // An open hospital admission — drives the header pill + management banner.
  const activeHospital = respitePeriods.find((p) => p.type === 'HOSPITAL' && Date.now() < new Date(p.endAt).getTime());

  const statusMut = useMutation({
    mutationFn: (vars: { status: ServiceUserStatus; effectiveAt?: string; hospitalReturnDate?: string }) =>
      serviceUsersApi.update(id, { status: vars.status, statusEffectiveAt: vars.effectiveAt, hospitalReturnDate: vars.hospitalReturnDate }),
    // Apply the new status to the cache immediately so the badge/dropdown update
    // without waiting on the refetch — then reconcile with the server response.
    onMutate: async ({ status }) => {
      await qc.cancelQueries({ queryKey: ['service-user', id] });
      const previous = qc.getQueryData<ServiceUser>(['service-user', id]);
      if (previous) qc.setQueryData(['service-user', id], { ...previous, status });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['service-user', id], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['service-user', id] });
      qc.invalidateQueries({ queryKey: ['service-users'] });
      // The Schedule calendar embeds each shift's serviceUser.status, so its
      // cached shifts list also needs to refetch to pick up the new status.
      qc.invalidateQueries({ queryKey: ['shifts'] });
      // A hospital admission/discharge creates or ends an away period.
      qc.invalidateQueries({ queryKey: ['respite', id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => serviceUsersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-users'] }); navigate('/service-users'); },
  });

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;
  if (isError || !su) {
    return (
      <div className="card text-center py-12 text-gray-400">
        <p>Service user not found.</p>
        <button className="btn-secondary btn mt-4" onClick={() => navigate('/service-users')}>← Back to Service Users</button>
      </div>
    );
  }

  let visits: { type: string; duration: number; days?: number[]; cover?: number }[] = [];
  try { visits = su?.visits ? JSON.parse(su.visits) : []; } catch { visits = []; }
  // A visit with no days, or all seven, runs every day; otherwise only the named days.
  const visitIsDaily = (v: { days?: number[] }) => !v.days || v.days.length === 0 || v.days.length === 7;
  const coverLabel = (n?: number) => (n === 3 ? 'Triple cover' : n === 2 ? 'Double cover' : '');

  const reviewOverdue = carePlan?.reviewDate ? new Date(carePlan.reviewDate) < new Date() : false;
  let carePlanSchedule: Record<string, Record<string, string>> = {};
  try { carePlanSchedule = carePlan?.schedule ? JSON.parse(carePlan.schedule) : {}; } catch { carePlanSchedule = {}; }
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SLOTS: [string, string][] = [['morning', 'Morning'], ['lunch', 'Lunch'], ['tea', 'Tea'], ['bed', 'Bed']];
  const scheduleRows = DAYS.filter((d) => SLOTS.some(([k]) => carePlanSchedule[d]?.[k]?.trim()));
  const hasCarePlan = !!carePlan && (scheduleRows.length > 0 || !!carePlan.tasksMorning || !!carePlan.tasksLunch || !!carePlan.tasksTea || !!carePlan.tasksBed || !!carePlan.carePackageInfo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/service-users')} className="text-sm text-blue-600 hover:underline mb-2">← Service Users</button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar photo={su.photo} firstName={su.firstName} lastName={su.lastName} size="lg" />
            <div>
            <h1 className="text-2xl font-bold text-gray-900">{su.title ? `${su.title} ` : ''}{su.firstName} {su.lastName}</h1>
            <p className="text-sm text-gray-500">
              {su.preferredName && `“${su.preferredName}” · `}
              {su.dateOfBirth && `${differenceInYears(new Date(), new Date(su.dateOfBirth))} yrs · DOB ${format(new Date(su.dateOfBirth), 'dd MMM yyyy')}`}
              {su.nhsNumber && ` · NHS ${su.nhsNumber}`}
              {su.packageId && ` · Package ${su.packageId}`}
              {su.gender && ` · ${su.gender}`}
              {su.ethnicOrigin && ` · ${su.ethnicOrigin}`}
              {su.serviceStartDate && ` · Started ${format(new Date(su.serviceStartDate), 'dd MMM yyyy')}`}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {su.site && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full text-white" style={{ backgroundColor: su.site.color }}>
                  📍 {su.site.name}
                </span>
              )}
              <span className="badge-blue badge">{visits.length || 1} visit{(visits.length || 1) > 1 ? 's' : ''}/day</span>
              {su.needsMedication && <span className="badge-red badge">Medication</span>}
              {su.needsMobility && <span className="badge-yellow badge">Mobility</span>}
              {su.needsPersonalCare && <span className="badge-purple badge">Personal Care</span>}
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${STATUS_META[su.status]?.className || STATUS_META.ACTIVE.className}`}>
                {su.status === 'HOSPITALISED' ? <HospitalIcon /> : STATUS_META[su.status]?.icon} {STATUS_META[su.status]?.label || su.status}
                {su.status !== 'ACTIVE' && su.statusUpdatedAt && (
                  <span className="opacity-75">· {format(new Date(su.statusUpdatedAt), 'd MMM yyyy')}</span>
                )}
              </span>
              {activeRespite && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  🏖️ On respite · until {format(new Date(activeRespite.endAt), 'd MMM yyyy')}
                </span>
              )}
              {activeHospital && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-800">
                  🏥 In hospital · until {format(new Date(activeHospital.endAt), 'd MMM yyyy')}
                </span>
              )}
            </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <button className="btn-secondary btn" onClick={() => setGrabSheetOpen(true)}>🚑 Grab Sheet</button>
            {isManager && (
              <>
              <div className="relative">
                <select
                  value={pendingStatus ?? su.status}
                  onChange={(e) => {
                    const next = e.target.value as ServiceUserStatus;
                    if (next === su.status) { setPendingStatus(null); return; }
                    setPendingStatus(next);
                    setEffectiveAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
                    // Default an expected return ~1 week out for a hospital admission.
                    if (next === 'HOSPITALISED') setHospitalReturn(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
                  }}
                  disabled={statusMut.isPending}
                  className="input"
                >
                  {Object.entries(STATUS_META).map(([value, meta]) => (
                    <option key={value} value={value}>{value === 'HOSPITALISED' ? '🔴 H' : meta.icon} {meta.label}</option>
                  ))}
                </select>
                {pendingStatus && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-gray-200 bg-white shadow-lg p-3 space-y-2 text-left">
                    <p className="text-sm font-medium text-gray-900">Change to {STATUS_META[pendingStatus]?.label || pendingStatus}</p>
                    <div>
                      <label className="label">Effective from</label>
                      <input type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} className="input" />
                    </div>
                    <p className="text-xs text-gray-500">Calls from this time onward show the new status. Defaults to now — back-date it if it happened earlier.</p>
                    {pendingStatus === 'HOSPITALISED' && (
                      <div>
                        <label className="label">Expected return date</label>
                        <input type="date" value={hospitalReturn} min={effectiveAt.slice(0, 10)} onChange={(e) => setHospitalReturn(e.target.value)} className="input" />
                        <p className="text-xs text-gray-500 mt-1">Visits from admission to this date are cancelled non-chargeable and carers are notified. You can extend or shorten it later.</p>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button className="btn-secondary btn btn-sm" onClick={() => setPendingStatus(null)}>Cancel</button>
                      <button
                        className="btn-primary btn btn-sm"
                        disabled={statusMut.isPending || !effectiveAt || (pendingStatus === 'HOSPITALISED' && !hospitalReturn)}
                        onClick={() => statusMut.mutate(
                          {
                            status: pendingStatus,
                            effectiveAt: new Date(effectiveAt).toISOString(),
                            hospitalReturnDate: pendingStatus === 'HOSPITALISED' && hospitalReturn ? new Date(`${hospitalReturn}T23:59:00`).toISOString() : undefined,
                          },
                          { onSuccess: () => setPendingStatus(null) },
                        )}
                      >
                        {statusMut.isPending ? 'Applying…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button className="btn-secondary btn" onClick={() => setFamilyAccessOpen(true)}>Family Access</button>
              <button className="btn-primary btn" onClick={() => navigate(`/service-users/${id}/edit`)}>Edit Details</button>
              </>
            )}
          </div>
        </div>
      </div>

      {isManager && activeHospital && (
        <HospitalBanner
          period={activeHospital}
          returning={statusMut.isPending}
          onMarkReturned={() => statusMut.mutate({ status: 'ACTIVE' as ServiceUserStatus, effectiveAt: new Date().toISOString() })}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal details — the full set captured on the edit form. */}
        <Section title="Personal Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title" value={su.title} />
            <Field label="Preferred Name" value={su.preferredName} />
            <Field label="First Name" value={su.firstName} />
            <Field label="Last Name" value={su.lastName} />
            <Field label="Gender" value={su.gender} />
            <Field label="Date of Birth" value={su.dateOfBirth ? format(new Date(su.dateOfBirth), 'dd MMM yyyy') : undefined} />
            <Field label="Age" value={su.dateOfBirth ? `${differenceInYears(new Date(), new Date(su.dateOfBirth))} years` : undefined} />
            <Field label="NHS Number" value={su.nhsNumber} />
            <Field label="Package ID" value={su.packageId} />
            <Field label="Ethnic Origin" value={su.ethnicOrigin} />
            <Field label="Area / Site" value={su.site?.name} />
            <Field label="Service Start Date" value={su.serviceStartDate ? format(new Date(su.serviceStartDate), 'dd MMM yyyy') : undefined} />
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact & Address">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Address" value={su.address} />
            <Field label="Postcode" value={su.postcode} />
            <Field label="Phone" value={su.phone} />
            <Field label="Email" value={su.email} />
            <Field label="Key Safe" value={su.keySafe} />
            <Field label="Meds Safe Code" value={su.medsSafeCode} />
          </div>
          {su.postcode && (
            <div className="mt-4">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${su.address || ''} ${su.postcode}`.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Open in Google Maps →
              </a>
              {geo ? (
                <iframe
                  title="Service user location"
                  className="w-full h-56 rounded-lg border mt-2"
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${geo.lon - 0.01}%2C${geo.lat - 0.01}%2C${geo.lon + 0.01}%2C${geo.lat + 0.01}&layer=mapnik&marker=${geo.lat}%2C${geo.lon}`}
                />
              ) : (
                <div className="w-full h-56 rounded-lg border mt-2 flex items-center justify-center text-sm text-gray-400">
                  Loading map…
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Away / Respite — cancels visits in the window as non-chargeable */}
        <RespiteSection serviceUserId={id} isManager={isManager} />

        {/* Emergency contact & next of kin */}
        <Section title="Emergency Contact & Next of Kin">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={su.emergencyContactName} />
            <Field label="Relationship" value={su.emergencyContactRelation} />
            <Field label="Phone" value={su.emergencyContactPhone} />
            <Field label="Mobile" value={su.emergencyContactMobile} />
            <Field label="Email" value={su.emergencyContactEmail} />
            <Field label="Address" value={su.emergencyContactAddress} />
          </div>
          <div className="border-t mt-4 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Next of Kin</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" value={su.nextOfKinName} />
              <Field label="Relationship" value={su.nextOfKinRelation} />
              <Field label="Phone" value={su.nextOfKinPhone} />
              <Field label="Mobile" value={su.nextOfKinMobile} />
              <Field label="Email" value={su.nextOfKinEmail} />
              <Field label="Address" value={su.nextOfKinAddress} />
            </div>
          </div>
        </Section>

        {/* GP */}
        <Section title="GP Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="GP Name" value={su.gpName} />
            <Field label="Practice / Surgery" value={su.gpPractice} />
            <Field label="Phone" value={su.gpPhone} />
            <Field label="Address" value={su.gpAddress} />
          </div>
        </Section>

        {/* Pharmacy */}
        <Section title="Pharmacy Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Pharmacy Name" value={su.pharmacyName} />
            <Field label="Phone" value={su.pharmacyPhone} />
            <div className="col-span-2"><Field label="Address" value={su.pharmacyAddress} /></div>
          </div>
        </Section>

        {/* Care needs / notes */}
        <Section title="Care Needs">
          <div className="flex flex-wrap gap-1">
            {su.needsMedication && <span className="badge-red badge">Medication</span>}
            {su.needsMobility && <span className="badge-yellow badge">Mobility</span>}
            {su.needsPersonalCare && <span className="badge-purple badge">Personal Care</span>}
            {!su.needsMedication && !su.needsMobility && !su.needsPersonalCare && <span className="text-sm text-gray-400">None recorded</span>}
          </div>
          <Field label="Contracted weekly hours" value={su.contractedWeeklyHours != null ? `${su.contractedWeeklyHours} h/week` : undefined} />
          <Field label="Care Notes" value={su.careNotes} />
        </Section>

        {/* Support categories (CQC PIR) */}
        <Section title="Support Categories">
          <div className="flex flex-wrap gap-1">
            {parseCategories(su.supportCategories).length === 0
              ? <span className="text-sm text-gray-400">None recorded</span>
              : parseCategories(su.supportCategories).map((c) => (
                  <span key={c} className="badge-blue badge">{c}</span>
                ))}
          </div>
        </Section>

        {/* Visits */}
        <Section title="Visits">
          {visits.length === 0 ? (
            <p className="text-sm text-gray-400">No visits set</p>
          ) : (
            <>
              <div className="space-y-1">
                {visits.map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 py-1">
                    <span className="text-gray-800">
                      {v.type}
                      {v.cover && v.cover > 1 && (
                        <span className="ml-2 text-xs font-medium text-purple-600">{coverLabel(v.cover)}</span>
                      )}
                      {!visitIsDaily(v) && (
                        <span className="ml-2 text-xs font-medium text-blue-600">
                          {v.days!.slice().sort((a, b) => a - b).map((d) => DAYS[d].slice(0, 3)).join(', ')}
                        </span>
                      )}
                    </span>
                    <span className="text-gray-500">{durationLabel(v.duration)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {(() => {
                  const daily = visits.filter(visitIsDaily).length;
                  const partial = visits.length - daily;
                  return partial === 0
                    ? `${visits.length} visit${visits.length > 1 ? 's' : ''} every day`
                    : `${daily} daily · ${partial} on selected days`;
                })()}
              </p>
            </>
          )}
        </Section>

        {/* Preferred caregivers */}
        <Section title="Preferred Caregivers">
          {su.preferredCaregivers.length === 0 ? (
            <p className="text-sm text-gray-400">None set</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {su.preferredCaregivers.map((c) => (
                <span key={c.id} className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700">{c.firstName} {c.lastName}</span>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Office Notes */}
      {isManager && <ServiceUserNotes serviceUserId={id} canManage={isManager} />}

      {/* Care Plan */}
      <Section
        title="Care Plan"
        action={
          <div className="flex items-center gap-3">
            {carePlan?.reviewDate && (
              <span className={`text-xs ${reviewOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                Review {format(new Date(carePlan.reviewDate), 'dd MMM yyyy')}{reviewOverdue ? ' · overdue' : ''}
              </span>
            )}
            <button className="btn-secondary btn btn-sm" onClick={() => setCarePlanOpen(true)}>
              {isManager ? (carePlan ? 'Edit Care Plan' : 'Create Care Plan') : 'Open'}
            </button>
          </div>
        }
      >
        {!hasCarePlan ? (
          <p className="text-sm text-gray-400">No care plan recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {scheduleRows.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-xs font-semibold text-gray-500 mb-1">Weekly Visit Profile</p>
                <table className="text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 border font-medium text-gray-600">Day</th>
                      {SLOTS.map(([k, label]) => <th key={k} className="text-left p-2 border font-medium text-gray-600">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((day) => (
                      <tr key={day}>
                        <td className="p-2 border font-medium text-gray-700">{day}</td>
                        {SLOTS.map(([k]) => <td key={k} className="p-2 border text-gray-800">{carePlanSchedule[day]?.[k] || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {([['Morning', carePlan?.tasksMorning], ['Lunch', carePlan?.tasksLunch], ['Tea', carePlan?.tasksTea], ['Bed', carePlan?.tasksBed]] as [string, string | undefined][])
                .filter(([, v]) => v?.trim())
                .map(([label, v]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-gray-500">{label} — tasks</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{v}</p>
                  </div>
                ))}
            </div>
            {carePlan?.numberOfCarers && <div><p className="text-xs font-semibold text-gray-500">Number of Carers</p><p className="text-sm text-gray-800">{carePlan.numberOfCarers}</p></div>}
            {carePlan?.carePackageInfo && <div><p className="text-xs font-semibold text-gray-500">Care Package Information</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{carePlan.carePackageInfo}</p></div>}
            {carePlan?.otherNotes && <div><p className="text-xs font-semibold text-gray-500">Other Notes</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{carePlan.otherNotes}</p></div>}
          </div>
        )}
      </Section>

      {/* Likes & Dislikes */}
      <Section
        title="Likes & Dislikes"
        action={
          <button className="btn-secondary btn btn-sm" onClick={() => setLikesDislikesOpen(true)}>
            {isManager ? (likesDislikes ? 'Edit' : 'Add') : 'Open'}
          </button>
        }
      >
        {!likesDislikes || (!likesDislikes.likes && !likesDislikes.dislikes) ? (
          <p className="text-sm text-gray-400">Nothing recorded yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {likesDislikes.likes && <div><p className="text-xs font-semibold text-gray-500">Likes</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{likesDislikes.likes}</p></div>}
            {likesDislikes.dislikes && <div><p className="text-xs font-semibold text-gray-500">Dislikes</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{likesDislikes.dislikes}</p></div>}
          </div>
        )}
      </Section>

      {/* Personal Service Plan */}
      <Section
        title="Personal Service Plan"
        action={
          <button className="btn-secondary btn btn-sm" onClick={() => setServicePlanOpen(true)}>
            {isManager ? (servicePlan ? 'Open / Edit' : 'Start Plan') : 'Open'}
          </button>
        }
      >
        <p className="text-sm text-gray-600">
          {servicePlan
            ? `Full assessment — last updated ${format(new Date(servicePlan.updatedAt), 'dd MMM yyyy, h:mm a')}.`
            : 'Comprehensive assessment (health, communication, personal care, medication, manual handling, safeguarding, consent and more). Not started yet.'}
        </p>
      </Section>

      {/* Medications */}
      <Section
        title="Medications"
        action={
          <div className="flex gap-2">
            <button className="btn-secondary btn btn-sm" onClick={() => setMarChartOpen(true)}>MAR Chart</button>
            <button className="btn-secondary btn btn-sm" onClick={() => setEmarOpen(true)}>Open eMAR</button>
          </div>
        }
      >
        {meds.length === 0 ? (
          <p className="text-sm text-gray-400">No active medications.</p>
        ) : (
          <div className="space-y-2">
            {meds.map((med: Medication) => {
              const times = parseTimes(med.times);
              return (
                <div key={med.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b last:border-0 pb-2 last:pb-0">
                  <span className="font-medium text-gray-900">{med.name}</span>
                  {med.dose && <span className="text-sm text-gray-500">{med.dose}</span>}
                  <span className="text-xs text-gray-400">{med.route || 'Oral'}</span>
                  <span className="flex-1" />
                  <span className="text-xs text-gray-600">{times.length ? times.join(', ') : 'PRN / as required'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Call logs */}
      <Section
        title="Call Logs"
        action={<button className="btn-secondary btn btn-sm" onClick={() => setLogsOpen(true)}>Open</button>}
      >
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">No call logs yet.</p>
        ) : (
          <div className="space-y-3">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span className="font-medium text-gray-700">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown carer'}</span>
                  <span>{format(new Date(log.createdAt), 'EEE dd MMM yyyy, h:mm a')}</span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>
              </div>
            ))}
            {logs.length > 5 && <p className="text-xs text-gray-400">Showing 5 of {logs.length} — open for full history.</p>}
          </div>
        )}
      </Section>

      <DocumentsTab ownerType="SERVICE_USER" ownerId={id} canManage={isManager} />

      {isManager && (
        <div className="card border-red-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-red-700">Delete Service User</h2>
            <p className="text-sm text-gray-500">Permanently remove {su.firstName} {su.lastName} and their records. This cannot be undone.</p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-700">Are you sure?</span>
              <button className="btn-danger btn" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
                {deleteMut.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button className="btn-secondary btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn-danger btn" onClick={() => setConfirmDelete(true)}>Delete Service User</button>
          )}
        </div>
      )}

      {carePlanOpen && <CarePlanModal serviceUser={su} onClose={() => setCarePlanOpen(false)} />}
      {likesDislikesOpen && <LikesDislikesModal serviceUser={su} onClose={() => setLikesDislikesOpen(false)} />}
      {servicePlanOpen && <PersonalServicePlanModal serviceUser={su} onClose={() => setServicePlanOpen(false)} />}
      {emarOpen && <EmarModal serviceUser={su} onClose={() => setEmarOpen(false)} />}
      {marChartOpen && <MarChartModal serviceUser={su} onClose={() => setMarChartOpen(false)} />}
      {logsOpen && <CallLogsModal serviceUser={su} onClose={() => setLogsOpen(false)} />}
      {familyAccessOpen && <FamilyAccessModal serviceUser={su} onClose={() => setFamilyAccessOpen(false)} />}
      {grabSheetOpen && <EmergencyGrabSheetModal serviceUser={su} canManage={isManager} onClose={() => setGrabSheetOpen(false)} />}
    </div>
  );
}

// Shown while a client is in hospital: summarises the admission and lets the
// office extend/shorten the expected return date (restoring or cancelling the
// affected visits) or mark them returned now.
function HospitalBanner({ period, onMarkReturned, returning }: { period: RespitePeriod; onMarkReturned: () => void; returning: boolean }) {
  const qc = useQueryClient();
  const [ret, setRet] = useState(period.endAt.slice(0, 10));
  const updateMut = useMutation({
    mutationFn: () => respiteApi.update(period.id, { endAt: new Date(`${ret}T23:59:00`).toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['respite', period.serviceUserId] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
  const changed = ret !== period.endAt.slice(0, 10);
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-semibold text-red-900">🏥 In hospital</p>
          <p className="text-sm text-red-800">
            Since {format(new Date(period.startAt), 'd MMM yyyy')} · {period.cancelledCount} visit{period.cancelledCount !== 1 ? 's' : ''} cancelled (non-chargeable). Expected back {format(new Date(period.endAt), 'd MMM yyyy')}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Expected return</label>
            <input type="date" value={ret} min={period.startAt.slice(0, 10)} onChange={(e) => setRet(e.target.value)} className="input" />
          </div>
          <button className="btn-secondary btn" disabled={!changed || updateMut.isPending} onClick={() => updateMut.mutate()}>
            {updateMut.isPending ? 'Saving…' : 'Update return date'}
          </button>
          <button className="btn-primary btn" disabled={returning} onClick={onMarkReturned}>
            {returning ? 'Applying…' : 'Mark returned now'}
          </button>
        </div>
      </div>
    </div>
  );
}
