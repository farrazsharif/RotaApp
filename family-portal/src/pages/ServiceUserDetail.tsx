import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { serviceUsersApi } from '../api/serviceUsers';
import { carePlansApi } from '../api/carePlans';
import { callLogsApi } from '../api/callLogs';
import { medicationsApi } from '../api/medications';

type Tab = 'info' | 'care' | 'logs' | 'emar';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SLOTS = [
  { key: 'morning', label: 'Morning' }, { key: 'lunch', label: 'Lunch' },
  { key: 'tea', label: 'Tea' }, { key: 'bed', label: 'Bed' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  GIVEN: 'Given', REFUSED: 'Refused', MISSED: 'Missed', NOT_NEEDED: 'Not needed', SELF_ADMIN: 'Self-admin',
};
const STATUS_COLOR: Record<string, string> = {
  GIVEN: 'text-green-700 bg-green-100', REFUSED: 'text-amber-700 bg-amber-100', MISSED: 'text-red-700 bg-red-100',
  NOT_NEEDED: 'text-gray-600 bg-gray-100', SELF_ADMIN: 'text-blue-700 bg-blue-100',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

export default function ServiceUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('info');

  const { data: su, isLoading, isError } = useQuery({
    queryKey: ['service-user', id],
    queryFn: () => serviceUsersApi.get(id!),
    enabled: !!id,
  });

  const { data: carePlan } = useQuery({
    queryKey: ['care-plan', id],
    queryFn: () => carePlansApi.get(id!),
    enabled: !!id && tab === 'care',
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['call-logs', id],
    queryFn: () => callLogsApi.list(id!),
    enabled: !!id && tab === 'logs',
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

  if (isLoading) {
    return (
      <Layout title="Client Details">
        <p className="text-center text-gray-400 py-8">Loading…</p>
      </Layout>
    );
  }

  if (isError || !su) {
    return (
      <Layout title="Client Details">
        <div className="text-center py-8">
          <p className="text-sm text-gray-400 mb-3">You don't have access to view this person.</p>
          <button onClick={() => navigate('/')} className="text-sm text-blue-600 font-medium">← Back</button>
        </div>
      </Layout>
    );
  }

  let schedule: Partial<Record<string, Partial<Record<string, string>>>> = {};
  try { schedule = carePlan?.schedule ? JSON.parse(carePlan.schedule) : {}; } catch { schedule = {}; }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'care', label: 'Care Plan' },
    { key: 'logs', label: 'Daily Logs' },
    { key: 'emar', label: 'eMAR' },
  ];

  return (
    <Layout title={`${su.firstName} ${su.lastName}`}>
      <div className="space-y-4">
        <button onClick={() => navigate('/')} className="text-sm text-blue-600 font-medium">← Your Family</button>

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
            <Field label="Address" value={su.address ? `${su.address}${su.postcode ? `, ${su.postcode}` : ''}` : undefined} />
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

        {tab === 'logs' && (
          <div className="space-y-3">
            {logs.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No daily logs yet</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span className="font-medium text-gray-700">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Carer'}</span>
                    <span>{format(new Date(log.createdAt), 'EEE dd MMM, h:mm a')}</span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>
                </div>
              ))
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
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                          {format(new Date(a.scheduledFor), 'dd MMM, h:mm a')}
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
