import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { User, Role } from '../types';
import { format } from 'date-fns';

const roleBadge: Record<Role, string> = {
  ADMIN: 'badge-purple',
  MANAGER: 'badge-blue',
  EMPLOYEE: 'badge-gray',
};

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  hourlyRate: string;
  phone: string;
}

const emptyForm: UserFormData = {
  email: '', password: '', firstName: '', lastName: '',
  role: 'EMPLOYEE', hourlyRate: '', phone: '',
};

export default function Users() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersApi.list(),
  });

  const createMut = useMutation({
    mutationFn: () => usersApi.create({ ...form, hourlyRate: Number(form.hourlyRate) || 0, phone: form.phone || undefined, password: form.password }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: () => usersApi.update(editUser!.id, { ...form, hourlyRate: Number(form.hourlyRate) || 0, phone: form.phone || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); closeModal(); },
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setConfirmDelete(null); },
  });

  function openNew() { setEditUser(null); setForm(emptyForm); setShowModal(true); }
  function openEdit(u: User) {
    setEditUser(u);
    setForm({ email: u.email, password: '', firstName: u.firstName, lastName: u.lastName, role: u.role, hourlyRate: String(u.hourlyRate), phone: u.phone || '' });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditUser(null); setForm(emptyForm); }

  const filtered = users.filter((u) =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <div className="flex gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="input w-48" />
          <button className="btn-primary btn" onClick={openNew}>+ Add Employee</button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Rate/hr</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((u: User) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <span className="font-medium">{u.firstName} {u.lastName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3"><span className={roleBadge[u.role]}>{u.role}</span></td>
                <td className="px-4 py-3 text-right text-gray-600">£{u.hourlyRate.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={u.active ? 'badge-green' : 'badge-red'}>{u.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {confirmDelete === u.id ? (
                    <div className="flex gap-2 justify-end items-center">
                      <span className="text-xs text-red-700">Delete permanently?</span>
                      <button
                        className="btn-danger btn btn-sm"
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate(u.id)}
                      >
                        {deleteMut.isPending ? 'Deleting…' : 'Yes'}
                      </button>
                      <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-end">
                      <button className="btn-secondary btn btn-sm" onClick={() => openEdit(u)}>Edit</button>
                      {isAdmin && u.active && (
                        <button className="btn-secondary btn btn-sm" onClick={() => deactivateMut.mutate(u.id)}>
                          Deactivate
                        </button>
                      )}
                      {isAdmin && (
                        <button className="btn-danger btn btn-sm" onClick={() => setConfirmDelete(u.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No users found</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editUser ? 'Edit Employee' : 'Add Employee'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
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
                <div>
                  <label className="label">Password *</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" />
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
                <button className="btn-secondary btn" onClick={closeModal}>Cancel</button>
                <button
                  className="btn-primary btn"
                  disabled={createMut.isPending || updateMut.isPending}
                  onClick={() => editUser ? updateMut.mutate() : createMut.mutate()}
                >
                  {editUser ? 'Save Changes' : 'Add Employee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
