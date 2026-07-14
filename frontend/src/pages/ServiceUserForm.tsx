import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi, ServiceUserData } from '../api/serviceUsers';
import { usersApi } from '../api/users';
import { sitesApi } from '../api/sites';
import { format } from 'date-fns';
import PhotoUpload from '../components/PhotoUpload';
import { VISIT_PRESETS } from '../lib/visits';
import { SUPPORT_CATEGORIES, parseCategories } from '../lib/supportCategories';

type FormState = ServiceUserData & { preferredCaregiverIds: string[] };

interface VisitRow { type: string; duration: number }

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const TITLE_OPTIONS = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Other'];

// Standard ONS/NHS ethnicity categories, grouped for the dropdown.
const ETHNIC_ORIGIN_GROUPS: { group: string; options: string[] }[] = [
  { group: 'White', options: ['White British', 'White Irish', 'Gypsy or Irish Traveller', 'Roma', 'Any other White background'] },
  { group: 'Mixed / multiple ethnic groups', options: ['White and Black Caribbean', 'White and Black African', 'White and Asian', 'Any other Mixed background'] },
  { group: 'Asian / Asian British', options: ['Indian', 'Pakistani', 'Bangladeshi', 'Chinese', 'Any other Asian background'] },
  { group: 'Black / African / Caribbean / Black British', options: ['African', 'Caribbean', 'Any other Black background'] },
  { group: 'Other ethnic group', options: ['Arab', 'Any other ethnic group'] },
];
const ETHNIC_ORIGIN_VALUES = ETHNIC_ORIGIN_GROUPS.flatMap((g) => g.options).concat('Prefer not to say');

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

// Whole years between a date of birth and today, or null if not a valid date.
function ageFromDob(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

const emptyForm: FormState = {
  firstName: '', lastName: '', title: '', preferredName: '', gender: '', ethnicOrigin: '', dateOfBirth: '', serviceStartDate: '', photo: '', siteId: '', nhsNumber: '', packageId: '', address: '', postcode: '', keySafe: '', medsSafeCode: '',
  phone: '', email: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactMobile: '', emergencyContactAddress: '', emergencyContactRelation: '',
  nextOfKinName: '', nextOfKinPhone: '', nextOfKinMobile: '', nextOfKinAddress: '', nextOfKinRelation: '',
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
  const [supportCats, setSupportCats] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(!isEdit);

  if (isEdit && su && !hydrated) {
    setForm({
      firstName: su.firstName, lastName: su.lastName, title: su.title || '',
      preferredName: su.preferredName || '', gender: su.gender || '', ethnicOrigin: su.ethnicOrigin || '',
      dateOfBirth: su.dateOfBirth ? format(new Date(su.dateOfBirth), 'yyyy-MM-dd') : '',
      serviceStartDate: su.serviceStartDate ? format(new Date(su.serviceStartDate), 'yyyy-MM-dd') : '',
      photo: su.photo || '',
      siteId: su.siteId || '',
      nhsNumber: su.nhsNumber || '', packageId: su.packageId || '', address: su.address || '', postcode: su.postcode || '', keySafe: su.keySafe || '', medsSafeCode: su.medsSafeCode || '',
      phone: su.phone || '', email: su.email || '',
      emergencyContactName: su.emergencyContactName || '', emergencyContactPhone: su.emergencyContactPhone || '',
      emergencyContactMobile: su.emergencyContactMobile || '', emergencyContactAddress: su.emergencyContactAddress || '',
      emergencyContactRelation: su.emergencyContactRelation || '',
      nextOfKinName: su.nextOfKinName || '', nextOfKinPhone: su.nextOfKinPhone || '',
      nextOfKinMobile: su.nextOfKinMobile || '', nextOfKinAddress: su.nextOfKinAddress || '', nextOfKinRelation: su.nextOfKinRelation || '',
      gpName: su.gpName || '', gpPractice: su.gpPractice || '', gpPhone: su.gpPhone || '', gpAddress: su.gpAddress || '',
      pharmacyName: su.pharmacyName || '', pharmacyPhone: su.pharmacyPhone || '', pharmacyAddress: su.pharmacyAddress || '',
      needsMedication: su.needsMedication, needsMobility: su.needsMobility, needsPersonalCare: su.needsPersonalCare,
      careNotes: su.careNotes || '', visitDuration: su.visitDuration,
      preferredCaregiverIds: su.preferredCaregivers.map((c) => c.id),
    });
    setVisits(parseVisits(su.visits));
    setSupportCats(parseCategories(su.supportCategories));
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

  const payload = (): ServiceUserData => ({ ...form, visits: JSON.stringify(visits), supportCategories: JSON.stringify(supportCats) });

  const toggleCategory = (c: string) =>
    setSupportCats((cats) => (cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]));
  const createMut = useMutation({ mutationFn: () => serviceUsersApi.create(payload()), onSuccess: onSaved });
  const updateMut = useMutation({ mutationFn: () => serviceUsersApi.update(id!, payload()), onSuccess: onSaved });

  const addVisit = () => setVisits((v) => [...v, { type: VISIT_PRESETS[0], duration: 30 }]);
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
        <div className="mb-4">
          <label className="label">Photo</label>
          <PhotoUpload
            photo={form.photo}
            firstName={form.firstName}
            lastName={form.lastName}
            onChange={(photo) => setForm({ ...form, photo: photo || '' })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Title</label>
            <select value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input w-48">
              <option value="">—</option>
              {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">First Name *</label>
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Preferred Name</label>
            <input value={form.preferredName || ''} onChange={(e) => setForm({ ...form, preferredName: e.target.value })} className="input" placeholder="What they like to be called" />
          </div>
          <div>
            <label className="label">Gender</label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-h-[42px]">
              {GENDER_OPTIONS.map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="gender" checked={form.gender === g} onChange={() => setForm({ ...form, gender: g })} className="h-4 w-4 accent-blue-600" />
                  {g}
                </label>
              ))}
              {form.gender && (
                <button type="button" onClick={() => setForm({ ...form, gender: '' })} className="text-xs text-gray-400 hover:text-gray-600">clear</button>
              )}
            </div>
          </div>
          <div>
            <label className="label">Date of Birth *</label>
            <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Age</label>
            <div className="input bg-gray-50 text-gray-600 flex items-center">
              {ageFromDob(form.dateOfBirth) !== null ? `${ageFromDob(form.dateOfBirth)} years` : '—'}
            </div>
          </div>
          <div>
            <label className="label">NHS Number</label>
            <input value={form.nhsNumber} onChange={(e) => setForm({ ...form, nhsNumber: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Package ID</label>
            <input value={form.packageId || ''} onChange={(e) => setForm({ ...form, packageId: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Ethnic Origin</label>
            <select value={form.ethnicOrigin || ''} onChange={(e) => setForm({ ...form, ethnicOrigin: e.target.value })} className="input">
              <option value="">Select…</option>
              {form.ethnicOrigin && !ETHNIC_ORIGIN_VALUES.includes(form.ethnicOrigin) && (
                <option value={form.ethnicOrigin}>{form.ethnicOrigin}</option>
              )}
              {ETHNIC_ORIGIN_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              ))}
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} className="input">
              <option value="">No site assigned</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Service Start Date</label>
            <input type="date" value={form.serviceStartDate || ''} onChange={(e) => setForm({ ...form, serviceStartDate: e.target.value })} className="input" />
          </div>
        </div>
      </Section>

      <Section title="Contact & Address">
        <div className="space-y-4">
          <div>
            <label className="label">Postcode *</label>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Key Safe</label>
              <input value={form.keySafe || ''} onChange={(e) => setForm({ ...form, keySafe: e.target.value })} className="input" placeholder="Location and/or code" />
            </div>
            <div>
              <label className="label">Meds Safe Code</label>
              <input value={form.medsSafeCode || ''} onChange={(e) => setForm({ ...form, medsSafeCode: e.target.value })} className="input" placeholder="Medication safe code" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Emergency Contact & Next of Kin">
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
            <label className="label">Mobile</label>
            <input value={form.emergencyContactMobile} onChange={(e) => setForm({ ...form, emergencyContactMobile: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Relationship</label>
            <input value={form.emergencyContactRelation} onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })} className="input" />
          </div>
          <div className="col-span-3">
            <label className="label">Address</label>
            <input value={form.emergencyContactAddress} onChange={(e) => setForm({ ...form, emergencyContactAddress: e.target.value })} className="input" />
          </div>
        </div>
        <div className="border-t mt-4 pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Next of Kin</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Name</label>
              <input value={form.nextOfKinName} onChange={(e) => setForm({ ...form, nextOfKinName: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={form.nextOfKinPhone} onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input value={form.nextOfKinMobile} onChange={(e) => setForm({ ...form, nextOfKinMobile: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Relationship</label>
              <input value={form.nextOfKinRelation} onChange={(e) => setForm({ ...form, nextOfKinRelation: e.target.value })} className="input" />
            </div>
            <div className="col-span-3">
              <label className="label">Address</label>
              <input value={form.nextOfKinAddress} onChange={(e) => setForm({ ...form, nextOfKinAddress: e.target.value })} className="input" />
            </div>
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

      <Section title="Support Categories (CQC PIR)">
        <p className="text-xs text-gray-500 -mt-1 mb-1">Tick all that apply. Used for the CQC PIR summary in Reports.</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {SUPPORT_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={supportCats.includes(c)} onChange={() => toggleCategory(c)} className="h-4 w-4 accent-blue-600" />
              {c}
            </label>
          ))}
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
            {visits.map((row, i) => {
              // A visit whose name isn't one of the presets is a custom ("Other")
              // call — show a free-text box so it can be typed or edited.
              const custom = !VISIT_PRESETS.includes(row.type);
              // Likewise a duration that isn't one of the presets is entered
              // manually — reveal a minutes input for it.
              const durationCustom = !DURATIONS.some((d) => d.value === row.duration);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                  <select
                    value={custom ? '__other__' : row.type}
                    onChange={(e) => updateVisit(i, { type: e.target.value === '__other__' ? '' : e.target.value })}
                    className="input flex-1"
                  >
                    {VISIT_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                    <option value="__other__">Other…</option>
                  </select>
                  {custom && (
                    <input
                      value={row.type}
                      onChange={(e) => updateVisit(i, { type: e.target.value })}
                      placeholder="Enter a call name"
                      className="input flex-1"
                    />
                  )}
                  <select
                    value={durationCustom ? '__custom__' : String(row.duration)}
                    onChange={(e) => updateVisit(i, { duration: e.target.value === '__custom__' ? 0 : Number(e.target.value) })}
                    className="input w-32"
                  >
                    {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {durationCustom && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        value={row.duration || ''}
                        onChange={(e) => updateVisit(i, { duration: Number(e.target.value) || 0 })}
                        placeholder="mins"
                        className="input w-20"
                      />
                      <span className="text-xs text-gray-400">min</span>
                    </div>
                  )}
                  <button type="button" onClick={() => removeVisit(i)} className="text-red-600 hover:text-red-700 text-lg px-1" title="Remove">×</button>
                </div>
              );
            })}
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
          disabled={!form.firstName || !form.lastName || !form.dateOfBirth || !form.postcode?.trim() || createMut.isPending || updateMut.isPending}
          onClick={() => isEdit ? updateMut.mutate() : createMut.mutate()}
        >
          {createMut.isPending || updateMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Service User'}
        </button>
      </div>
    </div>
  );
}
