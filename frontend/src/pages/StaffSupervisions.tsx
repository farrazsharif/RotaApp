import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffSupervisionApi, Supervision } from '../api/staffSupervision';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import SupervisionFormModal from '../components/SupervisionFormModal';

const staffName = (s: Supervision) => (s.user ? `${s.user.firstName} ${s.user.lastName}` : '—');

export default function StaffSupervisions({ embedded = false }: { embedded?: boolean }) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [newForUserId, setNewForUserId] = useState('');
  const [modal, setModal] = useState<{ userId: string; staffName: string; edit: Supervision | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: supervisions = [], isLoading } = useQuery({ queryKey: ['supervisions'], queryFn: () => staffSupervisionApi.list() });
  const { data: staff = [] } = useQuery({ queryKey: ['users', 'active'], queryFn: () => usersApi.list({ active: true }) });

  const deleteMut = useMutation({
    mutationFn: (id: string) => staffSupervisionApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supervisions'] }); qc.invalidateQueries({ queryKey: ['supervision-summary'] }); setConfirmDelete(null); },
  });

  const term = search.trim().toLowerCase();
  const filtered = supervisions.filter((s) => !term || `${staffName(s)} ${s.assessorName || ''}`.toLowerCase().includes(term));

  const isOverdue = (s: Supervision) => !!s.nextReviewDate && new Date(s.nextReviewDate) < new Date();
  // Only the most recent supervision per staff member decides "overdue".
  const latestPerUser = new Map<string, Supervision>();
  for (const s of supervisions) {
    const existing = latestPerUser.get(s.userId);
    if (!existing || new Date(s.date) > new Date(existing.date)) latestPerUser.set(s.userId, s);
  }
  const overdue = [...latestPerUser.values()].filter(isOverdue);
  const latestIds = new Set([...latestPerUser.values()].map((s) => s.id));

  const startNew = () => {
    const u = staff.find((x) => x.id === newForUserId);
    if (!u) return;
    setModal({ userId: u.id, staffName: `${u.firstName} ${u.lastName}`, edit: null });
  };

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff Supervisions</h1>
            <p className="text-sm text-gray-500">Supervision every 3 months per staff member</p>
          </div>
        )}
        <div className={`flex flex-wrap gap-3 ${embedded ? 'ml-auto' : ''}`}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by staff or assessor…" className="input w-64" />
          {isManager && (
            <div className="flex gap-2">
              <select value={newForUserId} onChange={(e) => setNewForUserId(e.target.value)} className="input">
                <option value="">Select staff…</option>
                {staff.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
              <button className="btn-secondary btn whitespace-nowrap" disabled={!newForUserId} onClick={startNew}>+ New Supervision</button>
            </div>
          )}
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          <p className="font-semibold mb-1">⚠ {overdue.length} supervision{overdue.length > 1 ? 's' : ''} overdue</p>
          <ul className="list-disc list-inside space-y-0.5">
            {overdue.map((s) => (
              <li key={s.id}>{staffName(s)} — next supervision was due {format(new Date(s.nextReviewDate!), 'dd MMM yyyy')}</li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>{term ? 'No supervisions match your search' : 'No supervisions recorded yet'}</p>
          {isManager && !term && <p className="text-sm mt-1">Select a staff member above and click "New Supervision" to get started.</p>}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Review Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Next Review</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Assessor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{staffName(s)}</td>
                  <td className="px-4 py-3 text-gray-600">{format(new Date(s.date), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">
                    {s.nextReviewDate ? (
                      isOverdue(s)
                        ? <span className="badge-red badge">⚠ {format(new Date(s.nextReviewDate), 'dd MMM yyyy')}</span>
                        : <span className="text-gray-600">{format(new Date(s.nextReviewDate), 'dd MMM yyyy')}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.assessorName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{format(new Date(s.updatedAt || s.createdAt), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === s.id ? (
                      <span className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-red-700">Delete?</span>
                        <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(s.id)}>Yes</button>
                        <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                      </span>
                    ) : (
                      <span className="flex gap-2 justify-end">
                        {isManager && isOverdue(s) && latestIds.has(s.id) && (
                          <button className="btn-primary btn btn-sm whitespace-nowrap" onClick={() => setModal({ userId: s.userId, staffName: staffName(s), edit: null })}>Review now</button>
                        )}
                        <button className="btn-secondary btn btn-sm" onClick={() => setModal({ userId: s.userId, staffName: staffName(s), edit: s })}>
                          {isManager ? 'Open / Edit' : 'View'}
                        </button>
                        {isManager && <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirmDelete(s.id)}>Delete</button>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <SupervisionFormModal
          userId={modal.userId}
          staffName={modal.staffName}
          editSupervision={modal.edit}
          readOnly={!isManager}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
