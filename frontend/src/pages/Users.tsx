import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { User, Role } from '../types';
import StaffFormModal from '../components/StaffFormModal';

const roleBadge: Record<Role, string> = {
  ADMIN: 'badge-purple',
  MANAGER: 'badge-blue',
  EMPLOYEE: 'badge-gray',
  FAMILY_MEMBER: 'badge-green',
};

export default function Users() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersApi.list(),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setConfirmDelete(null); },
  });

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
          <button className="btn-primary btn" onClick={() => setShowModal(true)}>+ Add Employee</button>
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
              <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)} className="hover:bg-gray-50 cursor-pointer">
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
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate(`/users/${u.id}`)}>View →</button>
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

      {showModal && <StaffFormModal editUser={null} onClose={() => setShowModal(false)} />}
    </div>
  );
}
