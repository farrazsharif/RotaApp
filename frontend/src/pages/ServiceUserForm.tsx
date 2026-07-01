import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi, ServiceUserData } from '../api/serviceUsers';
import { usersApi } from '../api/users';
import { sitesApi } from '../api/sites';
import { format } from 'date-fns';

type FormState = ServiceUserData & { preferredCaregiverIds: string[] };

interface VisitRow { type: string; duration: number }

const VISIT_TYPES = ['Morning', 'Lunch', 'Tea', 'Bed', 'Sitting Call', 'Cleaning Call'];
const DURATIONS = [
  { value: 15, label: '15 mins' }, { value: 30, label: '30 mins' }, { value: 45, label: '45 mins' },
  { value: 60, label: '1 hour' }, { value: 90, label: '1.5 hours' }, { value: 120, label: '2 hours' },
];

function parseVisits(json?: string): VisitRow[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((v) => v && v.type).map((v) => ({ type: String(v.type), duration: Number(v.duration) || 30 })) : [];
  } catch {
    return [];
  }
}

const emptyForm: FormState = {
  firstName: '', lastName: '', dateOfBirth: '', siteId: '', nhsNumber: '', address: '', postcode: '',
  phone: '', email: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  gpName: '', gpPractice: '', gpPhone: '', gpAddress: '',
  pharmacyName: '', pharmacyPhone: '', pharmacyAddress: '',
  needsMedication: false, needsMobility: false, needsPersonalCare: false, careNotes: '',
  visitDuration: 30, preferredCaregiverIds: [],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  );
}

export default function ServiceUserForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!id;

  const { data: su, isLoading } = useQuery({
    queryKey: ['service-user', id],
    queryFn: () => serviceUsersApi.get(id!),
    enabled: isEdit,
  });

  const [form, setForm] = useState<FormState>(emptyForm);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [hydrated, setHydrated] = useState(!isEdit);

  if (isEdit && su && !hydrated) {
    setForm({
      firstName: su.firstName, lastName: su.lastName,
      dateOfBirth: su.dateOfBirth ? format(new Date(su.dateOfBirth), 'yyyy-MM-dd') : '',
      siteId: su.siteId || '',
      nhsNumber: su.nhsNumber || '', address: su.address || '', postcode: su.postcode || '',
      phone: su.phone || '', email: su.email || '',
      emergencyContactName: su.emergencyContactName || '', emergencyContactPhone: su.emergencyContactPhone || '',
      emergencyContactRelation: su.emergencyContactRelation || '',
      gpName: su.gpName || '', gpPractice: su.gpPractice || '', gpPhone: su.gpPhone || '', gpAddress: su.gpAddress || '',
      pharmacyName: su.pharmacyName || '', pharmacyPhone: su.pharmacyPhone || '', pharmacyAddress: su.pharmacyAddress || '',
      needsMedication: su.needsMedication, needsMobility: su.needsMobility, needsPersonalCare: su.needsPersonalCare,
      careNotes: su.careNotes || '', visitDuration: su.visitDuration,
      preferredCaregiverIds: su.preferredCaregivers.map((c) => c.id),
    });
    setVisits(parseVisits(su.visits));
    setHydrated(true);
  }

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });
  const { data: caregivers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const backTo = isEdit ? `/service-users/${id}` : '/service-users';
  const onSaved = (saved: { id: string }) => {
    qc.invalidateQueries({ queryKey: ['service-users'] });
    if (isEdit) qc.invalidateQueries({ queryKey: ['service-user', id] });
    navigate(`/service-users/${saved.id}`);
  };

  const payload = (): ServiceUserData => ({ ...form, visits: JSON.stringify(visits) });
  const createMut = useMutation({ mutationFn: () => serviceUsersApi.create(payload()), onSuccess: onSaved });
  const updateMut = useMutation({ mutationFn: () => serviceUsersApi.update(id!, payload()), onSuccess: onSaved });

  const addVisit = () => setVisits((v) => [...v, { type: VISIT_TYPES[0], duration: 30 }]);
  const updateVisit = (i: number, patch: Partial<VisitRow>) => setVisits((v) => v.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const removeVisit = (i: number) => setVisits((v) => v.filter((_, idx) => idx !== i));

  const error = (createMut.error || updateMut.error) as { response?: { data?: { error?: string } } } | null;

  function toggleCaregiver(cid: string) {
    setForm((f) => ({
      ...f,
      preferredCaregiverIds: f.preferredCaregiverIds.includes(cid)
        ? f.preferredCaregiverIds.filter((x) => x !== cid)
        : [...f.preferredCaregiverIds, cid],
    }));
  }

  if (isEdit && isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <button onClick={() => navigate(backTo)} className="text-sm text-blue-600 hover:underline mb-2">← {isEdit ? 'Back to Service User' : 'Service Users'}</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Service User' : 'Add Service User'}</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error.response?.data?.error || 'An error occurred'}
        </div>
      )}

      <Section title="Personal Details">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First Name *</label>
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Date of Birth *</label>
            <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">NHS Number</label>
            <input value={form.nhsNumber} onChange={(e) => setForm({ ...form, nhsNumber: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Remote Site</label>
            <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} className="input">
              <option value="">No site assigned</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title="Contact & Address">
        <div className="space-y-4">
          <div>
            <label className="label">Postcode</label>
            <input
              value={form.postcode}
              onChange={(e) => setForm({ ...form, postcode: e.target.value })}
              className="input"
              placeholder="e.g. M23 1PS"
            />
          </div>
          <div>
            <label className="label">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Emergency Contact">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Name</label>
            <input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Relationship</label>
            <input value={form.emergencyContactRelation} onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })} className="input" />
          </div>
        </div>
      </Section>

      <Section title="GP Details">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">GP Name</label>
            <input value={form.gpName} onChange={(e) => setForm({ ...form, gpName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Practice / Surgery</label>
            <input value={form.gpPractice} onChange={(e) => setForm({ ...form, gpPractice: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">GP Phone</label>
            <input value={form.gpPhone} onChange={(e) => setForm({ ...form, gpPhone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">GP Address</label>
            <input value={form.gpAddress} onChange={(e) => setForm({ ...form, gpAddress: e.target.value })} className="input" />
          </div>
        </div>
      </Section>

      <Section title="Pharmacy Details">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Pharmacy Name</label>
            <input value={form.pharmacyName} onChange={(e) => setForm({ ...form, pharmacyName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Pharmacy Phone</label>
            <input value={form.pharmacyPhone} onChange={(e) => setForm({ ...form, pharmacyPhone: e.target.value })} className="input" />
          </div>
          <div className="col-span-2">
            <label className="label">Pharmacy Address</label>
            <input value={form.pharmacyAddress} onChange={(e) => setForm({ ...form, pharmacyAddress: e.target.value })} className="input" />
          </div>
        </div>
      </Section>

      <Section title="Care Needs">
        <div className="flex flex-wrap gap-4 mb-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.needsMedication} onChange={(e) => setForm({ ...form, needsMedication: e.target.checked })} />
            Medication
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.needsMobility} onChange={(e) => setForm({ ...form, needsMobility: e.target.checked })} />
            Mobility
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.needsPersonalCare} onChange={(e) => setForm({ ...form, needsPersonalCare: e.target.checked })} />
            Personal Care
          </label>
        </div>
        <div>
          <label className="label">Care Notes</label>
          <textarea value={form.careNotes} onChange={(e) => setForm({ ...form, careNotes: e.target.value })} rows={2} className="input resize-none" />
        </div>
      </Section>

      <Section title="Visits">
        <div className="flex items-center justify-between -mt-1 mb-1">
          <span />
          <button type="button" className="btn-secondary btn btn-sm" onClick={addVisit}>+ Add Visit</button>
        </div>
        {visits.length === 0 ? (
          <p className="text-sm text-gray-400">No visits added. Click "Add Visit" to set the number of visits and their duration.</p>
        ) : (
          <div className="space-y-2">
            {visits.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                <select value={row.type} onChange={(e) => updateVisit(i, { type: e.target.value })} className="input flex-1">
                  {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={row.duration} onChange={(e) => updateVisit(i, { duration: Number(e.target.value) })} className="input w-32">
                  {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <button type="button" onClick={() => removeVisit(i)} className="text-red-600 hover:text-red-700 text-lg px-1" title="Remove">×</button>
              </div>
            ))}
            <p className="text-xs text-gray-500">{visits.length} visit{visits.length > 1 ? 's' : ''} per day</p>
          </div>
        )}
      </Section>

      <Section title="Preferred Caregiver(s)">
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {caregivers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCaregiver(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                form.preferredCaregiverIds.includes(c.id)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {c.firstName} {c.lastName}
            </button>
          ))}
          {caregivers.length === 0 && <p className="text-sm text-gray-400">No caregivers available</p>}
        </div>
      </Section>

      <div className="flex gap-3 pt-2 pb-6">
        <div className="flex-1" />
        <button className="btn-secondary btn" onClick={() => navigate(backTo)}>Cancel</button>
        <button
          className="btn-primary btn"
          disabled={!form.firstName || !form.lastName || !form.dateOfBirth || createMut.isPending || updateMut.isPending}
          onClick={() => isEdit ? updateMut.mutate() : createMut.mutate()}
        >
          {createMut.isPending || updateMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Service User'}
        </button>
      </div>
    </div>
  );
}
