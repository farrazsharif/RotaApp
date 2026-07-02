import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsApi } from '../api/reviews';
import { serviceUsersApi } from '../api/serviceUsers';
import { useAuth } from '../contexts/AuthContext';
import { Review } from '../types';
import { format } from 'date-fns';
import ReviewFormModal from '../components/ReviewFormModal';

export default function Reviews() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [newForUserId, setNewForUserId] = useState('');
  const [modal, setModal] = useState<{ serviceUserId: string; serviceUserName: string; editReview: Review | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: reviews = [], isLoading } = useQuery({ queryKey: ['reviews'], queryFn: () => reviewsApi.list() });
  const { data: serviceUsers = [] } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => reviewsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reviews'] }); setConfirmDelete(null); },
  });

  const term = search.trim().toLowerCase();
  const filtered = reviews.filter((r) =>
    !term || `${r.serviceUser?.firstName} ${r.serviceUser?.lastName} ${r.assessorName || ''}`.toLowerCase().includes(term)
  );

  const startNewReview = () => {
    const su = serviceUsers.find((s) => s.id === newForUserId);
    if (!su) return;
    setModal({ serviceUserId: su.id, serviceUserName: `${su.firstName} ${su.lastName}`, editReview: null });
  };

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
          <p className="text-sm text-gray-500">6-week service reviews</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client or assessor…"
            className="input w-64"
          />
          {isManager && (
            <div className="flex gap-2">
              <select value={newForUserId} onChange={(e) => setNewForUserId(e.target.value)} className="input">
                <option value="">Select service user…</option>
                {serviceUsers.map((su) => (
                  <option key={su.id} value={su.id}>{su.firstName} {su.lastName}</option>
                ))}
              </select>
              <button className="btn-primary btn whitespace-nowrap" disabled={!newForUserId} onClick={startNewReview}>
                + New Review
              </button>
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>{term ? 'No reviews match your search' : 'No reviews recorded yet'}</p>
          {isManager && !term && <p className="text-sm mt-1">Select a service user above and click "New Review" to get started.</p>}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Service User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Review Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Assessor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.serviceUser ? `${r.serviceUser.firstName} ${r.serviceUser.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{format(new Date(r.reviewDate), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-gray-600">{r.assessorName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{format(new Date(r.updatedAt), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === r.id ? (
                      <span className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-red-700">Delete?</span>
                        <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(r.id)}>Yes</button>
                        <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                      </span>
                    ) : (
                      <span className="flex gap-2 justify-end">
                        <button
                          className="btn-secondary btn btn-sm"
                          onClick={() => setModal({
                            serviceUserId: r.serviceUserId,
                            serviceUserName: r.serviceUser ? `${r.serviceUser.firstName} ${r.serviceUser.lastName}` : '',
                            editReview: r,
                          })}
                        >
                          {isManager ? 'Open / Edit' : 'View'}
                        </button>
                        {isManager && (
                          <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirmDelete(r.id)}>Delete</button>
                        )}
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
        <ReviewFormModal
          serviceUserId={modal.serviceUserId}
          serviceUserName={modal.serviceUserName}
          editReview={modal.editReview}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
