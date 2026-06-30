import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { User, Role } from '../types';

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
  hourlyRate: string;
  phone: string;
  sendInvite: boolean;
}

const emptyForm: FormState = {
  email: '', password: '', firstName: '', lastName: '',
  role: 'EMPLOYEE', hourlyRate: '', phone: '', sendInvite: true,
};

function initialForm(u: User | null): FormState {
  if (!u) return emptyForm;
  return { email: u.email, password: '', firstName: u.firstName, lastName: u.lastName, role: u.role, hourlyRate: String(u.hourlyRate), phone: u.phone || '', sendInvite: false };
}

export default function StaffFormModal({ editUser, onClose, onSaved }: Props) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(editUser));

  const onSuccess = (user: User) => {
    qc.invalidateQueries({ queryKey: ['users'] });
    onSaved?.(user);
    onClose();
  };

  const createMut = useMutation({
    mutationFn: () => usersApi.create({
      ...form,
      hourlyRate: Number(form.hourlyRate) || 0,
      phone: form.phone || undefined,
      password: form.sendInvite ? undefined : form.password,
    }),
    onSuccess,
  });

  const updateMut = useMutation({
    mutationFn: () => usersApi.update(editUser!.id, { ...form, hourlyRate: Number(form.hourlyRate) || 0, phone: form.phone || undefined }),
    onSuccess,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{editUser ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
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
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" disabled={!!editUser} />
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
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="input">
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              {isAdmin && <option value="ADMIN">Admin</option>}
            </select>
          </div>
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
