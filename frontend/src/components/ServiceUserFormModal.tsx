import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi, ServiceUserData } from '../api/serviceUsers';
import { usersApi } from '../api/users';
import { sitesApi } from '../api/sites';
import { ServiceUser } from '../types';
import { format } from 'date-fns';

interface Props {
  editUser: ServiceUser | null;
  onClose: () => void;
}

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

function initialForm(su: ServiceUser | null): FormState {
  if (!su) return emptyForm;
  return {
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
  };
}

export default function ServiceUserFormModal({ editUser, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(editUser));
  const [visits, setVisits] = useState<VisitRow[]>(() => parseVisits(editUser?.visits));

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });
  const { data: caregivers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ['service-users'] });
    if (editUser) qc.invalidateQueries({ queryKey: ['service-user', editUser.id] });
    onClose();
  };

  const payload = (): ServiceUserData => ({ ...form, visits: JSON.stringify(visits) });
  const createMut = useMutation({ mutationFn: () => serviceUsersApi.create(payload()), onSuccess: onSaved });
  const updateMut = useMutation({ mutationFn: () => serviceUsersApi.update(editUser!.id, payload()), onSuccess: onSaved });

  const addVisit = () => setVisits((v) => [...v, { type: VISIT_TYPES[0], duration: 30 }]);
  const updateVisit = (i: number, patch: Partial<VisitRow>) => setVisits((v) => v.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const removeVisit = (i: number) => setVisits((v) => v.filter((_, idx) => idx !== i));

  const error = (createMut.error || updateMut.error) as { response?: { data?: { error?: string } } } | null;

  function toggleCaregiver(id: string) {
    setForm((f) => ({
      ...f,
      preferredCaregiverIds: f.preferredCaregiverIds.includes(id)
        ? f.preferredCaregiverIds.filter((x) => x !== id)
        : [...f.preferredCaregiverIds, id],
    }));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{editUser ? 'Edit Service User' : 'Add Service User'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error.response?.data?.error || 'An error occurred'}
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Personal Details</h3>
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Contact & Address</h3>
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</h3>
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">GP Details</h3>
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Pharmacy Details</h3>
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Care Needs</h3>
            <div className="flex flex-wrap gap-4 mb-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Visit Duration</label>
                <select value={form.visitDuration} onChange={(e) => setForm({ ...form, visitDuration: Number(e.target.value) })} className="input">
                  <option value={15}>15 mins</option>
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Care Notes</label>
              <textarea value={form.careNotes} onChange={(e) => setForm({ ...form, careNotes: e.target.value })} rows={2} className="input resize-none" />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Visits</h3>
              <button type="button" className="btn-secondary btn btn-sm" onClick={addVisit}>+ Add Visit</button>
            </div>
            {visits.length === 0 ? (
              <p className="text-sm text-gray-400">No visits added. Click “Add Visit” to set the number of visits and their duration.</p>
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Preferred Caregiver(s)</h3>
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
          </section>

          <div className="flex gap-3 pt-2 border-t">
            <div className="flex-1" />
            <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn"
              disabled={!form.firstName || !form.lastName || !form.dateOfBirth || createMut.isPending || updateMut.isPending}
              onClick={() => editUser ? updateMut.mutate() : createMut.mutate()}
            >
              {createMut.isPending || updateMut.isPending ? 'Saving…' : editUser ? 'Save Changes' : 'Add Service User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
