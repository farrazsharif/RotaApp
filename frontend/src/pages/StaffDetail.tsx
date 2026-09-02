import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { settingsApi } from '../api/settings';
import { trainingApi, TrainingData } from '../api/training';
import { importantDatesApi, ImportantDateData } from '../api/importantDates';
import { staffSupervisionApi, Supervision } from '../api/staffSupervision';
import SupervisionFormModal from '../components/SupervisionFormModal';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Role, Training, ImportantDate, FitForWork, YesNo, User, PermissionKey, roleLabel } from '../types';
import { format } from 'date-fns';
import CarerRota from '../components/CarerRota';
import StaffFormModal from '../components/StaffFormModal';
import Avatar from '../components/Avatar';
import SignaturePad from '../components/SignaturePad';
import DocumentsTab from '../components/DocumentsTab';
import { statusInfo } from './Users';

const roleBadge: Record<Role, string> = {
  ADMIN: 'badge-purple',
  MANAGER: 'badge-blue',
  EMPLOYEE: 'badge-gray',
  FAMILY_MEMBER: 'badge-green',
};

const TABS = ['Details', 'Compliance', 'Permissions', 'Rota', 'Training', 'Important Dates', 'Emergency Contact', 'Fit for Work', 'Supervision', 'Documents'] as const;
type Tab = typeof TABS[number];

// The health-declaration checklist from the paper "Fit for Work Declaration".
const FIT_FOR_WORK_CONDITIONS: { id: string; label: string }[] = [
  { id: 'asthma', label: 'Asthma or shortness of breath' },
  { id: 'epilepsy', label: 'Epilepsy or blackouts' },
  { id: 'bloodPressure', label: 'High / low blood pressure' },
  { id: 'stomach', label: 'Stomach disorders' },
  { id: 'hearing', label: 'Any hearing disability' },
  { id: 'liver', label: 'Liver disorders' },
  { id: 'diabetes', label: 'Diabetes (insulin dependent)' },
  { id: 'anaemia', label: 'Anaemia' },
  { id: 'nervous', label: 'Nervous disorders' },
  { id: 'allergies', label: 'Allergies' },
  { id: 'back', label: 'Back or disc related problem' },
  { id: 'mobility', label: 'Mobility problems' },
  { id: 'havs', label: 'Vibration white finger or any HAVs related condition' },
  { id: 'tenosynovitis', label: 'Tenosynovitis (joint problems)' },
];

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
  const { isManager, isAdmin } = useAuth();
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('Details');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['user', id],
    queryFn: () => usersApi.get(id),
    enabled: !!id,
  });

  // Staff-file document compliance — drives the header pill and Compliance tab.
  const { data: compliance } = useQuery({
    queryKey: ['user-compliance', id],
    queryFn: () => usersApi.complianceFor(id),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['user', id] });
  };
  const deactivateMut = useMutation({ mutationFn: () => usersApi.delete(id), onSuccess: invalidate });
  const reactivateMut = useMutation({ mutationFn: () => usersApi.reactivate(id), onSuccess: invalidate });
  const [inviteResent, setInviteResent] = useState(false);
  const resendMut = useMutation({
    mutationFn: () => usersApi.resendInvite(id),
    onSuccess: () => { setInviteResent(true); setTimeout(() => setInviteResent(false), 4000); },
  });
  const deleteMut = useMutation({
    mutationFn: () => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); navigate('/users'); },
  });
  // "View as carer": open the carer's app in a new tab via a short-lived token.
  const impersonateMut = useMutation({
    mutationFn: () => usersApi.impersonate(id),
    onSuccess: ({ token, url }) => { window.open(`${url}/login?sso=${encodeURIComponent(token)}`, '_blank', 'noopener'); },
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

  const statusValue = user.active ? 'active' : user.pendingSetup ? 'pending' : 'inactive';
  const statusPending = deactivateMut.isPending || reactivateMut.isPending;
  const changeStatus = (v: string) => {
    if (v === 'active' && !user.active) reactivateMut.mutate();
    // Deactivate covers both an active carer and a never-activated "Pending
    // setup" account (still active:false) — anything that isn't already inactive.
    else if (v === 'inactive' && statusValue !== 'inactive') deactivateMut.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate('/users')} className="text-sm text-blue-600 hover:underline mb-2">← Staff</button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar photo={user.photo} firstName={user.firstName} lastName={user.lastName} size="lg" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{user.firstName} {user.lastName}</h1>
              <p className="text-sm text-gray-500">{user.email}{user.phone && ` · ${user.phone}`}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={roleBadge[user.role]}>{user.customRole?.name || roleLabel(user.role)}</span>
                <span className={statusInfo(user).cls}>{statusInfo(user).label}</span>
                <span className="badge-blue badge">£{user.hourlyRate.toFixed(2)}/hr</span>
                {user.sites && user.sites.length > 0
                  ? user.sites.map((s) => (
                      <span key={s.id} className="badge" style={{ backgroundColor: `${s.color}22`, color: s.color }}>📍 {s.name}</span>
                    ))
                  : <span className="badge-gray badge">All sites</span>}
                {compliance && (
                  <button
                    type="button"
                    onClick={() => setTab('Compliance')}
                    title={compliance.complete ? 'All required documents in place' : `Missing: ${compliance.missing.join(', ')}`}
                    className={`badge ${compliance.complete ? 'badge-green' : 'badge-red'} hover:opacity-80`}
                  >
                    {compliance.complete ? '✓ File complete' : `⚠ ${compliance.missing.length} missing`}
                  </button>
                )}
              </div>
            </div>
          </div>
          {isManager && (
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {can('delete_staff') && (
                  <select
                    value={statusValue}
                    disabled={statusPending}
                    onChange={(e) => changeStatus(e.target.value)}
                    title="Change staff status"
                    className="input py-1.5 text-sm w-44"
                  >
                    <option value="active">🟢 Active</option>
                    <option value="inactive">⚪ Deactivated</option>
                    {statusValue === 'pending' && <option value="pending" disabled>⏳ Pending setup</option>}
                  </select>
                )}
                {can('manage_staff') && user.pendingSetup && (
                  inviteResent
                    ? <span className="text-sm text-green-700 font-medium">Invite sent ✓</span>
                    : <button className="btn-secondary btn" disabled={resendMut.isPending} onClick={() => resendMut.mutate()}>
                        {resendMut.isPending ? 'Sending…' : 'Resend invite'}
                      </button>
                )}
                {can('manage_staff') && user.role === 'EMPLOYEE' && user.active && (
                  <button className="btn-secondary btn" disabled={impersonateMut.isPending} onClick={() => impersonateMut.mutate()} title="Open this carer's app to see what they see">
                    {impersonateMut.isPending ? 'Opening…' : '👁 View as carer'}
                  </button>
                )}
                <button className="btn-primary btn" onClick={() => setEditOpen(true)}>Edit Details</button>
              </div>
              {can('delete_staff') && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-700">Delete permanently?</span>
                    <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
                      {deleteMut.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="text-red-600 text-sm font-medium hover:underline" onClick={() => setConfirmDelete(true)}>
                    Delete staff
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-1 -mb-px">
          {TABS.filter((t) => t !== 'Permissions' || (can('manage_permissions') && user.role !== 'ADMIN')).map((t) => (
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
              <div><p className="text-xs text-gray-400">Role</p><p className="text-sm text-gray-800">{user.customRole?.name || roleLabel(user.role)}</p></div>
              <div><p className="text-xs text-gray-400">Hourly Rate</p><p className="text-sm text-gray-800">£{user.hourlyRate.toFixed(2)}</p></div>
              <div><p className="text-xs text-gray-400">Status</p><p className="text-sm text-gray-800">{statusInfo(user).label}</p></div>
              <div><p className="text-xs text-gray-400">Joined</p><p className="text-sm text-gray-800">{format(new Date(user.createdAt), 'dd MMM yyyy')}</p></div>
            </div>
          </div>
          {isAdmin && <PasswordCard userId={user.id} email={user.email} />}
        </div>
      )}

      {tab === 'Compliance' && <ComplianceTab userId={user.id} onGoToTab={(t) => setTab(t)} />}
      {tab === 'Permissions' && can('manage_permissions') && user.role !== 'ADMIN' && (
        <PermissionsTab userId={user.id} initial={user} />
      )}
      {tab === 'Rota' && <CarerRota userId={user.id} staffName={`${user.firstName} ${user.lastName}`} />}
      {tab === 'Training' && <TrainingTab userId={user.id} isManager={isManager} />}
      {tab === 'Important Dates' && <ImportantDatesTab userId={user.id} isManager={isManager} />}
      {tab === 'Emergency Contact' && <EmergencyContactTab userId={user.id} isManager={isManager} initial={user} />}
      {tab === 'Fit for Work' && <FitForWorkTab userId={user.id} isManager={isManager} initial={user} />}
      {tab === 'Supervision' && <SupervisionTab userId={user.id} staffName={`${user.firstName} ${user.lastName}`} isManager={isManager} />}
      {tab === 'Documents' && <DocumentsTab ownerType="USER" ownerId={user.id} canManage={isManager} />}

      {editOpen && <StaffFormModal editUser={user} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function PasswordCard({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'set'>('idle');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const readErr = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error;

  const emailMut = useMutation({
    mutationFn: () => usersApi.resetPassword(userId, { mode: 'email' }),
    onSuccess: (r) => { setMsg(`Reset link sent to ${r.email || email}.`); },
    onError: (e) => setErr(readErr(e) || 'Could not send reset email — check the mail settings.'),
  });

  const setMut = useMutation({
    mutationFn: () => usersApi.resetPassword(userId, { mode: 'set', password: pw }),
    onSuccess: () => {
      // Setting a password also activates the account, so refresh so the
      // "Pending setup" badge/status updates to Active.
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', userId] });
      setMsg('Password set and account activated. Share the password with them securely — they can log in now.');
      setPw(''); setMode('idle');
    },
    onError: (e) => setErr(readErr(e) || 'Could not update password.'),
  });

  return (
    <div className="card space-y-3 sm:col-span-2">
      <h2 className="font-semibold text-gray-900">Password</h2>
      <p className="text-xs text-gray-500">
        Email a link so the user chooses their own password, or set one manually and share it with them.
      </p>

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary btn" disabled={emailMut.isPending} onClick={() => { setMsg(null); setErr(null); emailMut.mutate(); }}>
            {emailMut.isPending ? 'Sending…' : 'Send reset email'}
          </button>
          <button className="btn-secondary btn" onClick={() => { setMsg(null); setErr(null); setMode('set'); }}>
            Set password manually
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">New password (min 6 chars)</label>
            <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} className="input w-64" placeholder="Type a new password" />
          </div>
          <button className="btn-primary btn" disabled={pw.length < 6 || setMut.isPending} onClick={() => { setMsg(null); setErr(null); setMut.mutate(); }}>
            {setMut.isPending ? 'Saving…' : 'Save password'}
          </button>
          <button className="btn-secondary btn" onClick={() => { setMode('idle'); setPw(''); }}>Cancel</button>
        </div>
      )}

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

// The staff-file tab each requirement is fixed in comes from the backend
// (item.tab); only tabs that exist here are turned into a deep-link.
const KNOWN_TABS = new Set<string>(TABS);

function ComplianceTab({ userId, onGoToTab }: { userId: string; onGoToTab: (t: Tab) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['user-compliance', userId], queryFn: () => usersApi.complianceFor(userId) });

  if (isLoading || !data) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>;
  }

  return (
    <div className="card space-y-5 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">Staff file compliance</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            The documents and records a personnel file needs to meet CQC Regulation 19 (fit and proper persons). Anything missing is flagged below.
          </p>
        </div>
        <span className={`badge shrink-0 ${data.complete ? 'badge-green' : 'badge-red'}`}>
          {data.present}/{data.total} in place
        </span>
      </div>

      {data.complete ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✓ All required documents are in place for this staff member.
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          ⚠ {data.missing.length} item{data.missing.length === 1 ? '' : 's'} missing: {data.missing.join(', ')}.
        </div>
      )}

      <div className="divide-y border rounded-lg">
        {data.items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3 p-3">
            <div className="flex items-start gap-3">
              <StatusIcon ok={it.ok} />
              <div>
                <p className={`text-sm font-medium ${it.ok ? 'text-gray-900' : 'text-red-700'}`}>{it.label}</p>
                {!it.ok && <p className="text-xs text-gray-500 mt-0.5">{it.hint}</p>}
              </div>
            </div>
            {!it.ok && it.tab && KNOWN_TABS.has(it.tab) && (
              <button className="text-blue-600 text-xs hover:underline shrink-0" onClick={() => onGoToTab(it.tab as Tab)}>
                Fix in {it.tab} →
              </button>
            )}
          </div>
        ))}
      </div>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', userId] }); qc.invalidateQueries({ queryKey: ['user-compliance', userId] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => trainingApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', userId] }); qc.invalidateQueries({ queryKey: ['user-compliance', userId] }); setConfirmDeleteId(null); },
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

function PermissionsTab({ userId, initial }: { userId: string; initial: User }) {
  const qc = useQueryClient();
  const { data: perm } = useQuery({ queryKey: ['permissions'], queryFn: settingsApi.getPermissions });
  const defs = perm?.definitions ?? [];
  const groups = [...new Set(defs.map((d) => d.group))];
  const [custom, setCustom] = useState(!!initial.permissionsOverride);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.permissionsOverride ?? initial.capabilities ?? []));
  const [saved, setSaved] = useState(false);

  const toggle = (k: string) => { setSaved(false); setSelected((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }); };
  const saveMut = useMutation({
    mutationFn: () => usersApi.setPermissions(userId, custom ? ([...selected] as PermissionKey[]) : null),
    onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: ['user', userId] }); },
  });

  return (
    <div className="card space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold text-gray-900">Permissions — {initial.firstName} {initial.lastName}</h2>
        <p className="text-sm text-gray-500">By default this person follows their role ({initial.customRole?.name || roleLabel(initial.role)}). Turn on custom permissions to set exactly what they can do.</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-800">
        <input type="checkbox" checked={custom} onChange={(e) => { setCustom(e.target.checked); setSaved(false); }} className="h-4 w-4 accent-blue-600" />
        Set custom permissions for this person
      </label>
      {custom && (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{g}</p>
              <div className="space-y-1.5">
                {defs.filter((d) => d.group === g).map((d) => (
                  <label key={d.key} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={selected.has(d.key)} onChange={() => toggle(d.key)} className="h-4 w-4 accent-blue-600" />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 border-t pt-3">
        {saved && !saveMut.isPending && <span className="text-sm text-green-600">Saved ✓</span>}
        {saveMut.isError && <span className="text-sm text-red-600">{(saveMut.error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save.'}</span>}
        <div className="flex-1" />
        <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>{saveMut.isPending ? 'Saving…' : 'Save permissions'}</button>
      </div>
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

function EmergencyContactTab({ userId, isManager, initial }: { userId: string; isManager: boolean; initial: { emergencyContactName?: string; emergencyContactPhone?: string; emergencyContactRelation?: string; emergencyContactAddress?: string } }) {
  const qc = useQueryClient();
  const ro = !isManager;
  const [name, setName] = useState(initial.emergencyContactName || '');
  const [phone, setPhone] = useState(initial.emergencyContactPhone || '');
  const [relation, setRelation] = useState(initial.emergencyContactRelation || '');
  const [address, setAddress] = useState(initial.emergencyContactAddress || '');

  const saveMut = useMutation({
    mutationFn: () => usersApi.update(userId, {
      emergencyContactName: name || undefined,
      emergencyContactPhone: phone || undefined,
      emergencyContactRelation: relation || undefined,
      emergencyContactAddress: address || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['user', userId] }); qc.invalidateQueries({ queryKey: ['user-compliance', userId] }); },
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
      <div>
        <label className="label">Address</label>
        {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{address || '—'}</p> : <textarea value={address} rows={2} onChange={(e) => setAddress(e.target.value)} className="input resize-none" />}
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

// A YES / NO radio pair for a single health condition; renders plain text when read-only.
function YesNoRow({ label, value, ro, onChange }: { label: string; value: YesNo; ro: boolean; onChange: (v: YesNo) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-1.5">
      <span className="text-sm text-gray-800">{label}</span>
      {ro ? (
        <span className={`text-sm font-medium ${value === 'YES' ? 'text-red-600' : value === 'NO' ? 'text-gray-500' : 'text-gray-300'}`}>{value || '—'}</span>
      ) : (
        <span className="flex gap-3 flex-shrink-0 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={value === 'YES'} onChange={() => onChange('YES')} /> Yes</label>
          <label className="flex items-center gap-1"><input type="radio" checked={value === 'NO'} onChange={() => onChange('NO')} /> No</label>
        </span>
      )}
    </div>
  );
}

function SupervisionTab({ userId, staffName, isManager }: { userId: string; staffName: string; isManager: boolean }) {
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useQuery({ queryKey: ['supervisions', userId], queryFn: () => staffSupervisionApi.list(userId) });
  const [modal, setModal] = useState<{ edit: Supervision | null } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => staffSupervisionApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supervisions', userId] }); qc.invalidateQueries({ queryKey: ['supervision-summary'] }); setConfirmDeleteId(null); },
  });

  return (
    <div className="card space-y-4">
      {isLoading ? (
        <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
      ) : records.length === 0 ? (
        <p className="text-sm text-gray-400">No supervisions recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {records.map((s) => {
            const overdue = !!s.nextReviewDate && new Date(s.nextReviewDate) < new Date();
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{format(new Date(s.date), 'dd MMM yyyy')}</p>
                  <p className="text-xs text-gray-500">{s.position || 'No position'}{s.assessorName ? ` · Assessor: ${s.assessorName}` : ''}</p>
                  {s.nextReviewDate && (
                    <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>Next due: {format(new Date(s.nextReviewDate), 'dd MMM yyyy')}{overdue ? ' · overdue' : ''}</p>
                  )}
                </div>
                {isManager ? (
                  confirmDeleteId === s.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-red-700">Delete?</span>
                      <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(s.id)}>Yes</button>
                      <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                    </span>
                  ) : (
                    <span className="flex gap-2">
                      <button className="text-blue-600 text-xs hover:underline" onClick={() => setModal({ edit: s })}>Open / Edit</button>
                      <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(s.id)}>Delete</button>
                    </span>
                  )
                ) : (
                  <button className="text-blue-600 text-xs hover:underline" onClick={() => setModal({ edit: s })}>View</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isManager && (
        <button className="btn-primary btn" onClick={() => setModal({ edit: null })}>+ New Supervision</button>
      )}

      {modal && (
        <SupervisionFormModal userId={userId} staffName={staffName} editSupervision={modal.edit} readOnly={!isManager} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function FitForWorkTab({ userId, isManager, initial }: { userId: string; isManager: boolean; initial: User }) {
  const qc = useQueryClient();
  const ro = !isManager;
  const [form, setForm] = useState<FitForWork>(() => ({
    conditions: {},
    conditionsDetails: '',
    spectacles: '',
    medication: '',
    illness: '',
    restrictions: '' as YesNo,
    restrictionsDetails: '',
    signature: '',
    signedName: '',
    signedDate: '',
    ...(initial.fitForWork || {}),
  }));

  const set = <K extends keyof FitForWork>(key: K, val: FitForWork[K]) => setForm((f) => ({ ...f, [key]: val }));
  const setCondition = (id: string, val: YesNo) => setForm((f) => ({ ...f, conditions: { ...(f.conditions || {}), [id]: val } }));

  const saveMut = useMutation({
    mutationFn: () => usersApi.update(userId, { fitForWork: { ...form, updatedAt: new Date().toISOString() } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['user', userId] }); qc.invalidateQueries({ queryKey: ['user-compliance', userId] }); },
  });

  // A labelled free-text block. Called as a plain function (not <TextBlock/>) so
  // the textarea isn't remounted on every keystroke and keeps focus.
  const textBlock = (label: string, k: keyof FitForWork, rows = 2) => (
    <div>
      <label className="label">{label}</label>
      {ro
        ? <p className="text-sm text-gray-800 whitespace-pre-wrap min-h-[1.25rem]">{(form[k] as string) || '—'}</p>
        : <textarea value={(form[k] as string) || ''} rows={rows} onChange={(e) => set(k, e.target.value as FitForWork[typeof k])} className="input resize-none text-sm" />}
    </div>
  );

  return (
    <div className="card space-y-6 max-w-3xl">
      <div>
        <h2 className="font-semibold text-gray-900">Fit for Work Declaration</h2>
        <p className="text-xs text-gray-500">Staff health declaration to be completed on joining.{form.updatedAt && ` Last updated ${format(new Date(form.updatedAt), 'dd MMM yyyy')}.`}</p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-2">1. Do you suffer, or have you ever suffered from any of the following?</p>
        <div className="rounded-lg border border-gray-200 px-3">
          {FIT_FOR_WORK_CONDITIONS.map((c) => (
            <YesNoRow key={c.id} label={c.label} value={(form.conditions?.[c.id] as YesNo) || ''} ro={ro} onChange={(v) => setCondition(c.id, v)} />
          ))}
        </div>
        <div className="mt-3">{textBlock('Details (please provide details for any answered Yes)', 'conditionsDetails', 3)}</div>
      </div>

      {textBlock('2. Do you wear spectacles or contact lenses? If yes, for what reason? (e.g. short sight, reading)', 'spectacles')}
      {textBlock('3. Are you currently taking any medication (prescribed or over the counter)? Please give name, mgs and how often.', 'medication')}
      {textBlock('4. Any details of illness, hospitalisation, etc. that may affect your ability to work', 'illness')}

      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-900">5. Are there any restrictions to the work you are able to undertake?</span>
          {ro ? (
            <span className={`text-sm font-medium ${form.restrictions === 'YES' ? 'text-red-600' : form.restrictions === 'NO' ? 'text-gray-500' : 'text-gray-300'}`}>{form.restrictions || '—'}</span>
          ) : (
            <span className="flex gap-3 flex-shrink-0 text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={form.restrictions === 'YES'} onChange={() => set('restrictions', 'YES')} /> Yes</label>
              <label className="flex items-center gap-1"><input type="radio" checked={form.restrictions === 'NO'} onChange={() => set('restrictions', 'NO')} /> No</label>
            </span>
          )}
        </div>
        <div className="mt-2">{textBlock('If yes, please provide details', 'restrictionsDetails')}</div>
      </div>

      <div className="border-t pt-5 space-y-4">
        <p className="text-sm text-gray-700">I declare that all the information provided in this declaration is correct.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            {ro
              ? <p className="text-sm text-gray-800">{form.signedName || '—'}</p>
              : <input value={form.signedName || ''} onChange={(e) => set('signedName', e.target.value)} className="input" placeholder="Full name" />}
          </div>
          <div>
            <label className="label">Date</label>
            {ro
              ? <p className="text-sm text-gray-800">{form.signedDate ? format(new Date(form.signedDate), 'dd MMM yyyy') : '—'}</p>
              : <input type="date" value={form.signedDate || ''} onChange={(e) => set('signedDate', e.target.value)} className="input" />}
          </div>
        </div>
        <div>
          <label className="label">Signature</label>
          <SignaturePad value={form.signature || ''} ro={ro} onChange={(dataUrl) => set('signature', dataUrl)} />
        </div>
      </div>

      {isManager && (
        <div className="flex gap-3 pt-2">
          <div className="flex-1" />
          {saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600 self-center">Saved ✓</span>}
          {saveMut.isError && <span className="text-sm text-red-600 self-center">Could not save.</span>}
          <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Saving…' : 'Save Declaration'}
          </button>
        </div>
      )}
    </div>
  );
}
