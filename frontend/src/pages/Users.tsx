import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { usePermissions } from '../hooks/usePermissions';
import { User, Role, roleLabel } from '../types';
import StaffFormModal from '../components/StaffFormModal';
import Avatar from '../components/Avatar';

const roleBadge: Record<Role, string> = {
  ADMIN: 'badge-purple',
  MANAGER: 'badge-blue',
  EMPLOYEE: 'badge-gray',
  FAMILY_MEMBER: 'badge-green',
};

export function statusInfo(u: { active: boolean; pendingSetup?: boolean }) {
  if (u.active) return { cls: 'badge-green', label: 'Active' };
  if (u.pendingSetup) return { cls: 'badge-yellow', label: 'Pending setup' };
  return { cls: 'badge-red', label: 'Inactive' };
}

export default function Users() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersApi.list(),
  });

  const filtered = users.filter((u) =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    total: users.length,
    active: users.filter((u) => u.active).length,
    pending: users.filter((u) => !u.active && u.pendingSetup).length,
    inactive: users.filter((u) => !u.active && !u.pendingSetup).length,
  };

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <div className="flex gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="input w-48" />
          {can('manage_staff') && <button className="btn-primary btn" onClick={() => setShowModal(true)}>+ Add Staff</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900">{counts.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total staff</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600">{counts.active}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-amber-600">{counts.pending}</div>
          <div className="text-xs text-gray-500 mt-0.5">Pending setup</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600">{counts.inactive}</div>
          <div className="text-xs text-gray-500 mt-0.5">Inactive</div>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
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
              <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar photo={u.photo} firstName={u.firstName} lastName={u.lastName} size="sm" />
                    <span className="font-medium">{u.firstName} {u.lastName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={roleBadge[u.role]}>{u.customRole?.name || roleLabel(u.role)}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">£{u.hourlyRate.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {(() => { const s = statusInfo(u); return <span className={s.cls}>{s.label}</span>; })()}
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate(`/users/${u.id}`)}>View →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No users found</div>
        )}
      </div>

      {showModal && <StaffFormModal editUser={null} onClose={() => setShowModal(false)} />}
    </div>
  );
}
