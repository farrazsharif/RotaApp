import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { settingsApi } from '../api/settings';
import { authApi } from '../api/auth';
import { sitesApi } from '../api/sites';
import { rolesApi } from '../api/roles';
import { auditApi } from '../api/audit';
import { OrgSettings, Role, Site, PermissionKey, PermissionMap } from '../types';
import { format } from 'date-fns';
import PhotoUpload from '../components/PhotoUpload';
import { fileToLogoDataUrl } from '../lib/image';

const TIMEZONES = ['Europe/London', 'UTC', 'Europe/Dublin', 'Europe/Paris'];

type TabKey = 'account' | 'org' | 'sites' | 'staff' | 'roles' | 'audit';

export default function Settings() {
  const { can } = usePermissions();
  const tabs = [
    { key: 'account' as const, label: 'My Account', show: true },
    { key: 'org' as const, label: 'Organisation', show: can('manage_settings') },
    { key: 'sites' as const, label: 'Sites', show: can('manage_sites') },
    { key: 'staff' as const, label: 'Staff Defaults', show: can('manage_settings') },
    { key: 'roles' as const, label: 'Roles & Permissions', show: can('manage_permissions') },
    { key: 'audit' as const, label: 'Audit Log', show: can('view_audit_log') },
  ].filter((t) => t.show);

  const [tab, setTab] = useState<TabKey>('account');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        {can('manage_settings') && (
          <div className="flex items-center gap-2">
            <Link to="/settings/service-plan-template" className="text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">
              Service plan template
            </Link>
            <Link to="/settings/billing" className="text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">
              Billing &amp; subscription
            </Link>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-1 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'account' && <MyAccountTab />}
      {tab === 'org' && <OrganisationTab />}
      {tab === 'sites' && <SitesTab isManager={can('manage_sites')} />}
      {tab === 'staff' && <StaffDefaultsTab />}
      {tab === 'roles' && (
        <div className="space-y-6">
          <CustomRolesManager />
          <RolesPermissionsTab />
        </div>
      )}
      {tab === 'audit' && <AuditLogTab />}
    </div>
  );
}

/* ---------------- Audit Log ---------------- */
const ACTION_LABEL: Record<string, string> = {
  STAFF_CREATED: 'Staff created',
  STAFF_UPDATED: 'Staff updated',
  STAFF_DEACTIVATED: 'Staff deactivated',
  STAFF_DELETED: 'Staff deleted',
  INVITE_RESENT: 'Invite resent',
  PASSWORD_RESET_SENT: 'Password reset emailed',
  PASSWORD_SET_BY_ADMIN: 'Password set by admin',
  PASSWORD_CHANGED: 'Password changed',
  EMAIL_CHANGED: 'Email changed',
  PERMISSIONS_UPDATED: 'Permissions updated',
  SETTINGS_UPDATED: 'Settings updated',
  ROLE_CREATED: 'Role created',
  ROLE_UPDATED: 'Role updated',
  ROLE_DELETED: 'Role deleted',
  SERVICE_USER_CREATED: 'Service user added',
  SERVICE_USER_UPDATED: 'Service user updated',
  SERVICE_USER_DELETED: 'Service user deleted',
  CLOCK_RECORD_EDITED: 'Clock time edited',
  MEDICATION_ADDED: 'Medication added',
  MEDICATION_UPDATED: 'Medication updated',
  MEDICATION_DISCONTINUED: 'Medication discontinued',
  FUNDING_ADDED: 'Funding added',
  FUNDING_UPDATED: 'Funding updated',
  FUNDING_REMOVED: 'Funding removed',
  FUNDER_ADDED: 'Funder added',
  FUNDER_UPDATED: 'Funder updated',
  FUNDER_DELETED: 'Funder deleted',
  INVOICE_GENERATED: 'Invoice generated',
  INVOICE_UPDATED: 'Invoice updated',
  INVOICE_STATUS_CHANGED: 'Invoice status changed',
  INVOICE_DELETED: 'Invoice deleted',
};

function AuditLogTab() {
  const { data: logs = [], isLoading } = useQuery({ queryKey: ['audit'], queryFn: auditApi.list });

  return (
    <div className="card p-0 overflow-x-auto">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-gray-900">Audit Log</h2>
        <p className="text-sm text-gray-500">Recent sensitive changes — who did what and when.</p>
      </div>
      {isLoading ? (
        <div className="p-6 text-gray-400 text-sm">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="p-6 text-gray-400 text-sm">No activity recorded yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">When</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Who</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Action</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{format(new Date(l.createdAt), 'dd MMM yyyy HH:mm')}</td>
                <td className="px-4 py-2.5 text-gray-700">{l.actorName}</td>
                <td className="px-4 py-2.5"><span className="badge-blue badge">{ACTION_LABEL[l.action] || l.action}</span></td>
                <td className="px-4 py-2.5 text-gray-600">{l.target}{l.details ? ` — ${l.details}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------- Custom Roles ---------------- */
interface RoleDraft { id?: string; name: string; baseType: Role; permissions: PermissionKey[]; }

function CustomRolesManager() {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const { data: perm } = useQuery({ queryKey: ['permissions'], queryFn: settingsApi.getPermissions });
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');

  const saveMut = useMutation({
    mutationFn: (d: RoleDraft) =>
      d.id ? rolesApi.update(d.id, { name: d.name, baseType: d.baseType, permissions: d.permissions })
           : rolesApi.create({ name: d.name, baseType: d.baseType, permissions: d.permissions }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setDraft(null); setError(''); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not save role.');
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setConfirmDelete(null); },
  });

  const defs = perm?.definitions ?? [];
  const groups = [...new Set(defs.map((d) => d.group))];

  function toggle(key: PermissionKey) {
    if (!draft) return;
    const has = draft.permissions.includes(key);
    setDraft({ ...draft, permissions: has ? draft.permissions.filter((k) => k !== key) : [...draft.permissions, key] });
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Custom Roles</h2>
          <p className="text-sm text-gray-500">Named roles with their own capability set. Assign them to staff on the Staff page.</p>
        </div>
        {!draft && <button className="btn-primary btn" onClick={() => { setError(''); setDraft({ name: '', baseType: 'EMPLOYEE', permissions: [] }); }}>+ New Role</button>}
      </div>

      {!draft && (
        roles.length === 0
          ? <p className="text-sm text-gray-400">No custom roles yet.</p>
          : (
            <div className="space-y-2">
              {roles.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.name} <span className="text-xs text-gray-400">· base: {r.baseType}</span></p>
                    <p className="text-xs text-gray-400">{r.permissions.length} capabilities · {r.userCount} staff</p>
                  </div>
                  {confirmDelete === r.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-red-700">Delete? Staff revert to base role.</span>
                      <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(r.id)}>Yes</button>
                      <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                    </span>
                  ) : (
                    <span className="flex gap-2">
                      <button className="text-blue-600 text-xs hover:underline" onClick={() => { setError(''); setDraft({ id: r.id, name: r.name, baseType: r.baseType, permissions: r.permissions }); }}>Edit</button>
                      <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDelete(r.id)}>Delete</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
      )}

      {draft && (
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Role Name *</label><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" placeholder="e.g. Senior Carer" /></div>
            <div>
              <label className="label">Base Account Type</label>
              <select value={draft.baseType} onChange={(e) => setDraft({ ...draft, baseType: e.target.value as Role })} className="input">
                <option value="EMPLOYEE">Carer (carer app)</option>
                <option value="MANAGER">Manager (office app)</option>
                <option value="ADMIN">Admin (office app)</option>
                <option value="FAMILY_MEMBER">Family (family portal)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Which app/portal this role can sign into.</p>
            </div>
          </div>
          <div>
            <label className="label">Capabilities</label>
            <div className="space-y-3 border rounded-lg p-3">
              {groups.map((g) => (
                <div key={g}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{g}</p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {defs.filter((d) => d.group === g).map((d) => (
                      <label key={d.key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={draft.permissions.includes(d.key)} onChange={() => toggle(d.key)} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary btn" onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
            <div className="flex-1" />
            <button className="btn-primary btn" disabled={!draft.name || saveMut.isPending} onClick={() => saveMut.mutate(draft)}>
              {saveMut.isPending ? 'Saving…' : draft.id ? 'Save Role' : 'Create Role'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Roles & Permissions ---------------- */
const MATRIX_ROLES: { key: Role; label: string }[] = [
  { key: 'ADMIN', label: 'Admin' },
  { key: 'MANAGER', label: 'Manager' },
  { key: 'EMPLOYEE', label: 'Carer' },
  { key: 'FAMILY_MEMBER', label: 'Family' },
];

function RolesPermissionsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['permissions'], queryFn: settingsApi.getPermissions });
  const [draft, setDraft] = useState<Record<string, Role[]> | null>(null);
  const map = draft ?? data?.permissions ?? null;

  const mut = useMutation({
    mutationFn: (payload: PermissionMap) => settingsApi.updatePermissions(payload),
    onSuccess: (res) => { qc.setQueryData(['permissions'], res); setDraft(null); },
  });

  if (isLoading || !data || !map) return <div className="card text-gray-400">Loading…</div>;

  const groups = [...new Set(data.definitions.map((d) => d.group))];

  function toggle(key: PermissionKey, role: Role, protectedAdmin?: boolean) {
    if (protectedAdmin && role === 'ADMIN') return;
    const current = map![key] || [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setDraft({ ...map!, [key]: next });
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Roles &amp; Permissions</h2>
        <p className="text-sm text-gray-500">Choose which roles can perform each action. Admin keeps the critical rights so you can't lock yourself out.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[520px]">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-gray-600">Capability</th>
              {MATRIX_ROLES.map((r) => <th key={r.key} className="p-2 font-medium text-gray-600 text-center w-20">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="bg-gray-50"><td colSpan={5} className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</td></tr>
                {data.definitions.filter((d) => d.group === group).map((def) => (
                  <tr key={def.key} className="border-b">
                    <td className="p-2 text-gray-800">{def.label}</td>
                    {MATRIX_ROLES.map((r) => {
                      const locked = def.protectedAdmin && r.key === 'ADMIN';
                      return (
                        <td key={r.key} className="p-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-blue-600"
                            checked={(map![def.key] || []).includes(r.key)}
                            disabled={locked}
                            title={locked ? "Admin can't be removed from this" : undefined}
                            onChange={() => toggle(def.key, r.key, def.protectedAdmin)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 items-center pt-1">
        <div className="flex-1" />
        {mut.isSuccess && !draft && <span className="text-sm text-green-600">Saved ✓</span>}
        {draft && <button className="btn-secondary btn" onClick={() => setDraft(null)}>Discard</button>}
        <button className="btn-primary btn" disabled={!draft || mut.isPending} onClick={() => mut.mutate(map!)}>
          {mut.isPending ? 'Saving…' : 'Save Permissions'}
        </button>
      </div>
    </div>
  );
}

function Saved({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-sm text-green-600 self-center">Saved ✓</span>;
}

/* ---------------- My Account ---------------- */
function MyAccountTab() {
  const { user, refreshUser } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [photo, setPhoto] = useState(user?.photo || '');
  const [profileError, setProfileError] = useState('');

  const profileMut = useMutation({
    mutationFn: () => authApi.updateMe({ email: email || undefined, firstName, lastName, phone: phone || undefined, photo: photo || '' }),
    onSuccess: () => { setProfileError(''); refreshUser(); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setProfileError(e.response?.data?.error || 'Could not save profile.');
    },
  });

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const pwMut = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: () => { setCurrent(''); setNext(''); setConfirm(''); setPwError(''); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setPwError(e.response?.data?.error || 'Could not change password.');
    },
  });

  function submitPassword() {
    setPwError('');
    if (next.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setPwError('New passwords do not match.'); return; }
    pwMut.mutate();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">My Profile</h2>
        {profileError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{profileError}</div>}
        <PhotoUpload photo={photo} firstName={firstName} lastName={lastName} onChange={(p) => setPhoto(p || '')} />
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">First Name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" /></div>
          <div><label className="label">Last Name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className="input" /></div>
        </div>
        <div><label className="label">Email (your login)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></div>
        <div><label className="label">Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></div>
        <div className="flex gap-3 pt-1">
          <div className="flex-1" />
          <Saved show={profileMut.isSuccess && !profileMut.isPending} />
          <button className="btn-primary btn" disabled={profileMut.isPending} onClick={() => profileMut.mutate()}>
            {profileMut.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Change Password</h2>
        {pwError && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{pwError}</div>}
        {pwMut.isSuccess && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">Password changed.</div>}
        <div><label className="label">Current Password</label><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="input" /></div>
        <div><label className="label">New Password</label><input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="input" placeholder="At least 6 characters" /></div>
        <div><label className="label">Confirm New Password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" /></div>
        <div className="flex justify-end pt-1">
          <button className="btn-primary btn" disabled={pwMut.isPending || !current || !next} onClick={submitPassword}>
            {pwMut.isPending ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Organisation ---------------- */
function OrganisationTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Partial<OrgSettings> | null>(null);
  const s = form ?? data;

  const mut = useMutation({
    mutationFn: (payload: Partial<OrgSettings>) => settingsApi.update(payload),
    onSuccess: (updated) => { qc.setQueryData(['settings'], updated); setForm(null); },
  });

  if (isLoading || !s) return <div className="card text-gray-400">Loading…</div>;
  const set = (patch: Partial<OrgSettings>) => setForm({ ...s, ...patch });

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToLogoDataUrl(file);
    set({ logo: dataUrl });
  }

  return (
    <div className="card space-y-4 max-w-2xl">
      <h2 className="font-semibold text-gray-900">Organisation Profile</h2>

      <div>
        <label className="label">Logo</label>
        <div className="flex items-center gap-4">
          <div className="h-16 w-32 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
            {s.logo ? <img src={s.logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-gray-400">No logo</span>}
          </div>
          <label className="btn-secondary btn cursor-pointer">
            Upload<input type="file" accept="image/*" className="hidden" onChange={onLogo} />
          </label>
          {s.logo && <button className="text-sm text-red-600 hover:underline" onClick={() => set({ logo: null })}>Remove</button>}
        </div>
      </div>

      <div><label className="label">Company Name *</label><input value={s.companyName || ''} onChange={(e) => set({ companyName: e.target.value })} className="input" /></div>
      <div><label className="label">Address</label><textarea value={s.address || ''} onChange={(e) => set({ address: e.target.value })} rows={2} className="input resize-none" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Phone</label><input value={s.phone || ''} onChange={(e) => set({ phone: e.target.value })} className="input" /></div>
        <div><label className="label">Email</label><input value={s.email || ''} onChange={(e) => set({ email: e.target.value })} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">CQC Provider ID</label><input value={s.cqcProviderId || ''} onChange={(e) => set({ cqcProviderId: e.target.value })} className="input" /></div>
        <div><label className="label">ICO Registration No.</label><input value={s.icoNumber || ''} onChange={(e) => set({ icoNumber: e.target.value })} className="input" /></div>
      </div>
      <div>
        <label className="label">Timezone</label>
        <select value={s.timezone} onChange={(e) => set({ timezone: e.target.value })} className="input">
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div className="flex gap-3 pt-1 items-center">
        <div className="flex-1" />
        <Saved show={mut.isSuccess && !mut.isPending && !form} />
        <button className="btn-primary btn" disabled={mut.isPending || !s.companyName} onClick={() => mut.mutate(s)}>
          {mut.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Sites ---------------- */
function SitesTab({ isManager }: { isManager: boolean }) {
  const qc = useQueryClient();
  const { data: sites = [], isLoading } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => { setName(''); setColor('#3b82f6'); setEditingId(null); setError(''); };
  const invalidate = () => qc.invalidateQueries({ queryKey: ['sites'] });

  const saveMut = useMutation({
    mutationFn: () => (editingId ? sitesApi.update(editingId, { name, color }) : sitesApi.create({ name, color })),
    onSuccess: () => { invalidate(); reset(); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not save site.');
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => sitesApi.delete(id),
    onSuccess: () => { invalidate(); setConfirmDeleteId(null); },
  });

  return (
    <div className="card space-y-5 max-w-2xl">
      <h2 className="font-semibold text-gray-900">Locations</h2>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : sites.length === 0 ? (
        <p className="text-sm text-gray-400">No sites yet.</p>
      ) : (
        <div className="space-y-2">
          {sites.map((site: Site & { _count?: { serviceUsers: number } }) => (
            <div key={site.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full border" style={{ backgroundColor: site.color }} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{site.name}</p>
                  <p className="text-xs text-gray-400">{site._count?.serviceUsers ?? 0} service users</p>
                </div>
              </div>
              {isManager && (
                confirmDeleteId === site.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-red-700">Delete? Service users will be unassigned.</span>
                    <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(site.id)}>Yes</button>
                    <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                  </span>
                ) : (
                  <span className="flex gap-2">
                    <button className="text-blue-600 text-xs hover:underline" onClick={() => { setEditingId(site.id); setName(site.name); setColor(site.color); }}>Edit</button>
                    <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(site.id)}>Delete</button>
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {isManager && (
        <div className="border-t pt-4 space-y-3">
          <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Location' : 'Add Location'}</h3>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="flex items-end gap-3">
            <div className="flex-1"><label className="label">Name *</label><input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. North Team" /></div>
            <div><label className="label">Colour</label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 rounded border p-1" /></div>
          </div>
          <div className="flex gap-3">
            {editingId && <button className="btn-secondary btn" onClick={reset}>Cancel Edit</button>}
            <div className="flex-1" />
            <button className="btn-primary btn" disabled={!name || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Location'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Staff Defaults ---------------- */
function StaffDefaultsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Partial<OrgSettings> | null>(null);
  const s = form ?? data;

  const mut = useMutation({
    mutationFn: (payload: Partial<OrgSettings>) => settingsApi.update(payload),
    onSuccess: (updated) => { qc.setQueryData(['settings'], updated); setForm(null); },
  });

  if (isLoading || !s) return <div className="card text-gray-400">Loading…</div>;
  const set = (patch: Partial<OrgSettings>) => setForm({ ...s, ...patch });

  return (
    <div className="card space-y-4 max-w-xl">
      <h2 className="font-semibold text-gray-900">Staff Defaults</h2>
      <p className="text-sm text-gray-500">Applied when adding new staff and calculating reports.</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Default Hourly Rate (£)</label>
          <input type="number" step="0.01" value={s.defaultHourlyRate ?? 0} onChange={(e) => set({ defaultHourlyRate: Number(e.target.value) })} className="input" />
        </div>
        <div>
          <label className="label">Default Role</label>
          <select value={s.defaultRole} onChange={(e) => set({ defaultRole: e.target.value as Role })} className="input">
            <option value="EMPLOYEE">Carer</option>
            <option value="MANAGER">Manager</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Overtime Threshold (hrs/week)</label>
          <input type="number" step="1" value={s.overtimeThreshold ?? 40} onChange={(e) => set({ overtimeThreshold: Number(e.target.value) })} className="input" />
          <p className="text-xs text-gray-400 mt-1">Hours above this count as overtime in reports.</p>
        </div>
        <div>
          <label className="label">Invite Link Expiry (days)</label>
          <input type="number" step="1" value={s.inviteExpiryDays ?? 7} onChange={(e) => set({ inviteExpiryDays: Number(e.target.value) })} className="input" />
          <p className="text-xs text-gray-400 mt-1">How long a set-password link stays valid.</p>
        </div>
      </div>

      <div className="flex gap-3 pt-1 items-center">
        <div className="flex-1" />
        <Saved show={mut.isSuccess && !mut.isPending && !form} />
        <button className="btn-primary btn" disabled={mut.isPending} onClick={() => mut.mutate(s)}>
          {mut.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
