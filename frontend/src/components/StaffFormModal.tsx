import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { settingsApi } from '../api/settings';
import { rolesApi } from '../api/roles';
import { sitesApi } from '../api/sites';
import { useAuth } from '../contexts/AuthContext';
import { User, Role } from '../types';
import PhotoUpload from './PhotoUpload';

interface Props {
  editUser: User | null;
  onClose: () => void;
  onSaved?: (user: User) => void;
}

interface FormState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  customRoleId: string;
  siteIds: string[];
  hourlyRate: string;
  phone: string;
  photo: string;
  sendInvite: boolean;
}

const emptyForm: FormState = {
  email: '', password: '', firstName: '', lastName: '',
  role: 'EMPLOYEE', customRoleId: '', siteIds: [], hourlyRate: '', phone: '', photo: '', sendInvite: true,
};

function initialForm(u: User | null): FormState {
  if (!u) return emptyForm;
  return { email: u.email, password: '', firstName: u.firstName, lastName: u.lastName, role: u.role, customRoleId: u.customRoleId || '', siteIds: (u.sites || []).map((s) => s.id), hourlyRate: String(u.hourlyRate), phone: u.phone || '', photo: u.photo || '', sendInvite: false };
}

export default function StaffFormModal({ editUser, onClose, onSaved }: Props) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(editUser));

  const { data: customRoles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });

  function toggleSite(id: string) {
    setForm((f) => ({ ...f, siteIds: f.siteIds.includes(id) ? f.siteIds.filter((s) => s !== id) : [...f.siteIds, id] }));
  }

  // For a new employee, prefill rate and role from the org's Staff Defaults.
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (editUser || !settings || defaultsApplied.current) return;
    defaultsApplied.current = true;
    setForm((f) => ({
      ...f,
      hourlyRate: f.hourlyRate || (settings.defaultHourlyRate ? String(settings.defaultHourlyRate) : ''),
      role: settings.defaultRole || f.role,
    }));
  }, [settings, editUser]);

  const onSuccess = (user: User) => {
    qc.invalidateQueries({ queryKey: ['users'] });
    onSaved?.(user);
    onClose();
  };

  const [error, setError] = useState('');
  const onError = (err: unknown) => {
    const e = err as { response?: { data?: { error?: string } } };
    setError(e.response?.data?.error || 'Could not save. Please try again.');
  };

  const createMut = useMutation({
    mutationFn: () => usersApi.create({
      ...form,
      hourlyRate: Number(form.hourlyRate) || 0,
      phone: form.phone || undefined,
      password: form.sendInvite ? undefined : form.password,
    }),
    onSuccess,
    onError,
  });

  const updateMut = useMutation({
    mutationFn: () => usersApi.update(editUser!.id, { ...form, hourlyRate: Number(form.hourlyRate) || 0, phone: form.phone || undefined }),
    onSuccess,
    onError,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{editUser ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="label">Photo</label>
            <PhotoUpload
              photo={form.photo}
              firstName={form.firstName}
              lastName={form.lastName}
              onChange={(photo) => setForm({ ...form, photo: photo || '' })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
            {editUser && <p className="text-xs text-gray-400 mt-1">This is their login email — changing it changes how they sign in.</p>}
          </div>
          {!editUser && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.sendInvite}
                  onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
                />
                Email them a link to set their own password
              </label>
              {form.sendInvite ? (
                <p className="text-xs text-gray-500">
                  We'll send {form.email || 'their email address'} a welcome email with a link to choose a password. The link expires in 7 days.
                </p>
              ) : (
                <div>
                  <label className="label">Password *</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" />
                </div>
              )}
            </div>
          )}
          <div>
            <label className="label">Role</label>
            <select
              value={form.customRoleId ? `custom:${form.customRoleId}` : `base:${form.role}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('custom:')) setForm({ ...form, customRoleId: v.slice(7) });
                else setForm({ ...form, customRoleId: '', role: v.slice(5) as Role });
              }}
              className="input"
            >
              <optgroup label="Built-in">
                <option value="base:EMPLOYEE">Carer</option>
                <option value="base:MANAGER">Manager</option>
                {isAdmin && <option value="base:ADMIN">Admin</option>}
              </optgroup>
              {customRoles.filter((r) => isAdmin || r.baseType !== 'ADMIN').length > 0 && (
                <optgroup label="Custom roles">
                  {customRoles.filter((r) => isAdmin || r.baseType !== 'ADMIN').map((r) => (
                    <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {sites.length > 0 && (
            <div>
              <label className="label">Site access</label>
              <div className="flex flex-wrap gap-2">
                {sites.map((s) => {
                  const on = form.siteIds.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleSite(s.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Leave all unselected for full access to every site. Selecting sites restricts this person to only those locations.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Hourly Rate (£)</label>
              <input type="number" step="0.01" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <div className="flex-1" />
            <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn"
              disabled={
                createMut.isPending || updateMut.isPending ||
                (!editUser && !form.sendInvite && !form.password)
              }
              onClick={() => editUser ? updateMut.mutate() : createMut.mutate()}
            >
              {editUser ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
