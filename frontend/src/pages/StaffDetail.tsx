import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { trainingApi, TrainingData } from '../api/training';
import { importantDatesApi, ImportantDateData } from '../api/importantDates';
import { useAuth } from '../contexts/AuthContext';
import { Role, Training, ImportantDate } from '../types';
import { format } from 'date-fns';
import StaffFormModal from '../components/StaffFormModal';

const roleBadge: Record<Role, string> = {
  ADMIN: 'badge-purple',
  MANAGER: 'badge-blue',
  EMPLOYEE: 'badge-gray',
  FAMILY_MEMBER: 'badge-green',
};

const TABS = ['Details', 'Training', 'Important Dates', 'Emergency Contact'] as const;
type Tab = typeof TABS[number];

const COURSES = [
  'First Aid', 'Safeguarding Adults e-learning', 'Safeguarding Children',
  'Manual Handling', 'Infection Control', 'Medication Administration',
  'Health & Safety', 'Fire Safety', 'Food Hygiene', 'GDPR / Data Protection',
  'Equality & Diversity', 'Dementia Care', 'Other',
];
const COMMON_LABELS = ['DBS Renewal', 'Supervision', 'Appraisal', 'Contract Review', 'Probation Review', 'Other'];

function isValid(t: Training): boolean {
  if (!t.expiresAt) return true;
  return new Date(t.expiresAt) >= new Date();
}
function isOverdue(d: ImportantDate): boolean {
  return new Date(d.date) < new Date();
}
function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-green-600 text-green-600 text-xs">✓</span>
    : <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-red-600 text-red-600 text-xs">✕</span>;
}

export default function StaffDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const [tab, setTab] = useState<Tab>('Details');
  const [editOpen, setEditOpen] = useState(false);

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.get(id),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;
  if (isError || !user) {
    return (
      <div className="card text-center py-12 text-gray-400">
        <p>Staff member not found.</p>
        <button className="btn-secondary btn mt-4" onClick={() => navigate('/users')}>← Back to Staff</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate('/users')} className="text-sm text-blue-600 hover:underline mb-2">← Staff</button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user.firstName} {user.lastName}</h1>
            <p className="text-sm text-gray-500">{user.email}{user.phone && ` · ${user.phone}`}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={roleBadge[user.role]}>{user.role}</span>
              <span className={user.active ? 'badge-green' : 'badge-red'}>{user.active ? 'Active' : 'Inactive'}</span>
              <span className="badge-blue badge">£{user.hourlyRate.toFixed(2)}/hr</span>
            </div>
          </div>
          {isManager && <button className="btn-primary btn" onClick={() => setEditOpen(true)}>Edit Details</button>}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'Details' && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-900">Contact</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-400">Email</p><p className="text-sm text-gray-800">{user.email}</p></div>
              <div><p className="text-xs text-gray-400">Phone</p><p className="text-sm text-gray-800">{user.phone || '—'}</p></div>
            </div>
          </div>
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-900">Job</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-400">Role</p><p className="text-sm text-gray-800">{user.role}</p></div>
              <div><p className="text-xs text-gray-400">Hourly Rate</p><p className="text-sm text-gray-800">£{user.hourlyRate.toFixed(2)}</p></div>
              <div><p className="text-xs text-gray-400">Status</p><p className="text-sm text-gray-800">{user.active ? 'Active' : 'Inactive'}</p></div>
              <div><p className="text-xs text-gray-400">Joined</p><p className="text-sm text-gray-800">{format(new Date(user.createdAt), 'dd MMM yyyy')}</p></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Training' && <TrainingTab userId={user.id} isManager={isManager} />}
      {tab === 'Important Dates' && <ImportantDatesTab userId={user.id} isManager={isManager} />}
      {tab === 'Emergency Contact' && <EmergencyContactTab userId={user.id} isManager={isManager} initial={user} />}

      {editOpen && <StaffFormModal editUser={user} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function TrainingTab({ userId, isManager }: { userId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState({ course: '', date: format(new Date(), 'yyyy-MM-dd'), expiresAt: '', accredited: false, description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({ queryKey: ['training', userId], queryFn: () => trainingApi.list(userId) });

  const visibleRecords = showAll
    ? records
    : Object.values(
        records.reduce((acc, t) => {
          if (!acc[t.course] || new Date(t.date) > new Date(acc[t.course].date)) acc[t.course] = t;
          return acc;
        }, {} as Record<string, Training>)
      );

  const resetForm = () => { setForm({ course: '', date: format(new Date(), 'yyyy-MM-dd'), expiresAt: '', accredited: false, description: '' }); setEditingId(null); };

  const saveMut = useMutation({
    mutationFn: () => {
      const data: TrainingData = { userId, course: form.course, date: form.date, expiresAt: form.expiresAt || undefined, accredited: form.accredited, description: form.description || undefined };
      return editingId ? trainingApi.update(editingId, data) : trainingApi.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', userId] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => trainingApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', userId] }); setConfirmDeleteId(null); },
  });

  function startEdit(t: Training) {
    setEditingId(t.id);
    setForm({ course: t.course, date: format(new Date(t.date), 'yyyy-MM-dd'), expiresAt: t.expiresAt ? format(new Date(t.expiresAt), 'yyyy-MM-dd') : '', accredited: t.accredited, description: t.description || '' });
  }

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5"><input type="radio" checked={!showAll} onChange={() => setShowAll(false)} /> Most Recent</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={showAll} onChange={() => setShowAll(true)} /> All</label>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="text-left p-2.5 font-medium">Course</th>
                <th className="text-left p-2.5 font-medium">Date</th>
                <th className="text-left p-2.5 font-medium">Expires</th>
                <th className="text-center p-2.5 font-medium">Valid</th>
                <th className="text-center p-2.5 font-medium">Accredited</th>
                {isManager && <th className="text-right p-2.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRecords.map((t) => (
                <tr key={t.id}>
                  <td className="p-2.5 text-gray-900">{t.course}</td>
                  <td className="p-2.5 text-gray-600">{format(new Date(t.date), 'dd-MM-yyyy')}</td>
                  <td className="p-2.5 text-gray-600">{t.expiresAt ? format(new Date(t.expiresAt), 'dd-MM-yyyy') : '—'}</td>
                  <td className="p-2.5 text-center"><StatusIcon ok={isValid(t)} /></td>
                  <td className="p-2.5 text-center"><StatusIcon ok={t.accredited} /></td>
                  {isManager && (
                    <td className="p-2.5 text-right">
                      {confirmDeleteId === t.id ? (
                        <span className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-red-700">Delete?</span>
                          <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(t.id)}>Yes</button>
                          <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                        </span>
                      ) : (
                        <span className="flex gap-2 justify-end">
                          <button className="text-blue-600 text-xs hover:underline" onClick={() => startEdit(t)}>Edit</button>
                          <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(t.id)}>Delete</button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {visibleRecords.length === 0 && (
                <tr><td colSpan={isManager ? 6 : 5} className="p-6 text-center text-gray-400">No training recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isManager && (
        <div className="border-t pt-5 space-y-4">
          <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Training Record' : 'Add Training Attended'}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Training Course *</label>
              <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} className="input">
                <option value="">Please Select</option>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Expires</label>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input resize-none text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.accredited} onChange={(e) => setForm({ ...form, accredited: e.target.checked })} />
            Accredited
          </label>
          <div className="flex gap-3">
            {editingId && <button className="btn-secondary btn" onClick={resetForm}>Cancel Edit</button>}
            <div className="flex-1" />
            <button className="btn-primary btn" disabled={!form.course || !form.date || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Training'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportantDatesTab({ userId, isManager }: { userId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ label: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({ queryKey: ['important-dates', userId], queryFn: () => importantDatesApi.list(userId) });

  const resetForm = () => { setForm({ label: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' }); setEditingId(null); };

  const saveMut = useMutation({
    mutationFn: () => {
      const data: ImportantDateData = { userId, label: form.label, date: form.date, notes: form.notes || undefined };
      return editingId ? importantDatesApi.update(editingId, data) : importantDatesApi.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['important-dates', userId] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => importantDatesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['important-dates', userId] }); setConfirmDeleteId(null); },
  });

  function startEdit(d: ImportantDate) {
    setEditingId(d.id);
    setForm({ label: d.label, date: format(new Date(d.date), 'yyyy-MM-dd'), notes: d.notes || '' });
  }

  return (
    <div className="card space-y-6">
      {isLoading ? (
        <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
      ) : records.length === 0 ? (
        <p className="text-sm text-gray-400">No important dates recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {records.map((d) => (
            <div key={d.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${isOverdue(d) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
              <div>
                <p className="text-sm font-medium text-gray-900">{d.label}</p>
                <p className={`text-xs ${isOverdue(d) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  {format(new Date(d.date), 'dd MMM yyyy')}{isOverdue(d) ? ' · overdue' : ''}
                </p>
                {d.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{d.notes}</p>}
              </div>
              {isManager && (
                confirmDeleteId === d.id ? (
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-red-700">Delete?</span>
                    <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(d.id)}>Yes</button>
                    <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                  </span>
                ) : (
                  <span className="flex gap-2 flex-shrink-0">
                    <button className="text-blue-600 text-xs hover:underline" onClick={() => startEdit(d)}>Edit</button>
                    <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(d.id)}>Delete</button>
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {isManager && (
        <div className="border-t pt-5 space-y-4">
          <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Important Date' : 'Add Important Date'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Label *</label>
              <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="input">
                <option value="">Please Select</option>
                {COMMON_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input resize-none text-sm" />
          </div>
          <div className="flex gap-3">
            {editingId && <button className="btn-secondary btn" onClick={resetForm}>Cancel Edit</button>}
            <div className="flex-1" />
            <button className="btn-primary btn" disabled={!form.label || !form.date || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Date'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmergencyContactTab({ userId, isManager, initial }: { userId: string; isManager: boolean; initial: { emergencyContactName?: string; emergencyContactPhone?: string; emergencyContactRelation?: string } }) {
  const qc = useQueryClient();
  const ro = !isManager;
  const [name, setName] = useState(initial.emergencyContactName || '');
  const [phone, setPhone] = useState(initial.emergencyContactPhone || '');
  const [relation, setRelation] = useState(initial.emergencyContactRelation || '');

  const saveMut = useMutation({
    mutationFn: () => usersApi.update(userId, {
      emergencyContactName: name || undefined,
      emergencyContactPhone: phone || undefined,
      emergencyContactRelation: relation || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['user', userId] }); },
  });

  return (
    <div className="card space-y-4 max-w-md">
      <div>
        <label className="label">Name</label>
        {ro ? <p className="text-sm text-gray-800">{name || '—'}</p> : <input value={name} onChange={(e) => setName(e.target.value)} className="input" />}
      </div>
      <div>
        <label className="label">Phone</label>
        {ro ? <p className="text-sm text-gray-800">{phone || '—'}</p> : <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />}
      </div>
      <div>
        <label className="label">Relationship</label>
        {ro ? <p className="text-sm text-gray-800">{relation || '—'}</p> : <input value={relation} onChange={(e) => setRelation(e.target.value)} className="input" />}
      </div>
      {isManager && (
        <div className="flex gap-3 pt-2">
          <div className="flex-1" />
          {saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600 self-center">Saved ✓</span>}
          <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
