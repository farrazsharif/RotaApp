import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi } from '../api/serviceUsers';
import { ServiceUserStatus, ServiceUser, Medication } from '../types';
import { carePlansApi } from '../api/carePlans';
import { servicePlansApi } from '../api/servicePlans';
import { medicationsApi } from '../api/medications';
import { callLogsApi } from '../api/callLogs';
import { useAuth } from '../contexts/AuthContext';
import { format, differenceInYears } from 'date-fns';
import ServiceUserFormModal from '../components/ServiceUserFormModal';
import HospitalIcon from '../components/HospitalIcon';
import CarePlanModal from '../components/CarePlanModal';
import PersonalServicePlanModal from '../components/PersonalServicePlanModal';
import EmarModal from '../components/EmarModal';
import MarChartModal from '../components/MarChartModal';
import CallLogsModal from '../components/CallLogsModal';
import FamilyAccessModal from '../components/FamilyAccessModal';

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
  const [editOpen, setEditOpen] = useState(false);
  const [carePlanOpen, setCarePlanOpen] = useState(false);
  const [servicePlanOpen, setServicePlanOpen] = useState(false);
  const [emarOpen, setEmarOpen] = useState(false);
  const [marChartOpen, setMarChartOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [familyAccessOpen, setFamilyAccessOpen] = useState(false);

  const { data: su, isLoading, isError } = useQuery({
    queryKey: ['service-user', id],
    queryFn: () => serviceUsersApi.get(id),
    enabled: !!id,
  });

  const { data: carePlan } = useQuery({ queryKey: ['care-plan', id], queryFn: () => carePlansApi.get(id), enabled: !!id });
  const { data: servicePlan } = useQuery({ queryKey: ['service-plan', id], queryFn: () => servicePlansApi.get(id), enabled: !!id });
  const { data: meds = [] } = useQuery({ queryKey: ['medications', id], queryFn: () => medicationsApi.list(id), enabled: !!id });
  const { data: logs = [] } = useQuery({ queryKey: ['call-logs', id], queryFn: () => callLogsApi.list(id), enabled: !!id });

  const statusMut = useMutation({
    mutationFn: (status: ServiceUserStatus) => serviceUsersApi.update(id, { status }),
    // Apply the new status to the cache immediately so the badge/dropdown update
    // without waiting on the refetch — then reconcile with the server response.
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ['service-user', id] });
      const previous = qc.getQueryData<ServiceUser>(['service-user', id]);
      if (previous) qc.setQueryData(['service-user', id], { ...previous, status });
      return { previous };
    },
    onError: (_err, _status, context) => {
      if (context?.previous) qc.setQueryData(['service-user', id], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['service-user', id] });
      qc.invalidateQueries({ queryKey: ['service-users'] });
    },
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

  let visits: { type: string; duration: number }[] = [];
  try { visits = su?.visits ? JSON.parse(su.visits) : []; } catch { visits = []; }

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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{su.firstName} {su.lastName}</h1>
            <p className="text-sm text-gray-500">
              {su.dateOfBirth && `${differenceInYears(new Date(), new Date(su.dateOfBirth))} yrs · DOB ${format(new Date(su.dateOfBirth), 'dd MMM yyyy')}`}
              {su.nhsNumber && ` · NHS ${su.nhsNumber}`}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {su.site && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full text-white" style={{ backgroundColor: su.site.color }}>
                  📍 {su.site.name}
                </span>
              )}
              <span className="badge-blue badge">Visit {durationLabel(su.visitDuration)}</span>
              {su.needsMedication && <span className="badge-red badge">Medication</span>}
              {su.needsMobility && <span className="badge-yellow badge">Mobility</span>}
              {su.needsPersonalCare && <span className="badge-purple badge">Personal Care</span>}
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${STATUS_META[su.status]?.className || STATUS_META.ACTIVE.className}`}>
                {su.status === 'HOSPITALISED' ? <HospitalIcon /> : STATUS_META[su.status]?.icon} {STATUS_META[su.status]?.label || su.status}
              </span>
            </div>
          </div>
          {isManager && (
            <div className="flex items-start gap-2">
              <select
                value={su.status}
                onChange={(e) => statusMut.mutate(e.target.value as ServiceUserStatus)}
                disabled={statusMut.isPending}
                className="input"
              >
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>{value === 'HOSPITALISED' ? '🔴 H' : meta.icon} {meta.label}</option>
                ))}
              </select>
              <button className="btn-secondary btn" onClick={() => setFamilyAccessOpen(true)}>Family Access</button>
              <button className="btn-primary btn" onClick={() => setEditOpen(true)}>Edit Details</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact */}
        <Section title="Contact & Address">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Address" value={su.address} />
            <Field label="Postcode" value={su.postcode} />
            <Field label="Phone" value={su.phone} />
            <Field label="Email" value={su.email} />
          </div>
        </Section>

        {/* Emergency contact */}
        <Section title="Emergency Contact">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={su.emergencyContactName} />
            <Field label="Relationship" value={su.emergencyContactRelation} />
            <Field label="Phone" value={su.emergencyContactPhone} />
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
          <Field label="Care Notes" value={su.careNotes} />
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
                    <span className="text-gray-800">{v.type}</span>
                    <span className="text-gray-500">{durationLabel(v.duration)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{visits.length} visit{visits.length > 1 ? 's' : ''} per day</p>
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

      {editOpen && <ServiceUserFormModal editUser={su} onClose={() => setEditOpen(false)} />}
      {carePlanOpen && <CarePlanModal serviceUser={su} onClose={() => setCarePlanOpen(false)} />}
      {servicePlanOpen && <PersonalServicePlanModal serviceUser={su} onClose={() => setServicePlanOpen(false)} />}
      {emarOpen && <EmarModal serviceUser={su} onClose={() => setEmarOpen(false)} />}
      {marChartOpen && <MarChartModal serviceUser={su} onClose={() => setMarChartOpen(false)} />}
      {logsOpen && <CallLogsModal serviceUser={su} onClose={() => setLogsOpen(false)} />}
      {familyAccessOpen && <FamilyAccessModal serviceUser={su} onClose={() => setFamilyAccessOpen(false)} />}
    </div>
  );
}
