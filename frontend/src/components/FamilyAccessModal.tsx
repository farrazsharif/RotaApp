import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { familyLinksApi } from '../api/familyLinks';
import { ServiceUser } from '../types';

export default function FamilyAccessModal({ serviceUser, onClose }: { serviceUser: ServiceUser; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [relation, setRelation] = useState('');
  const [error, setError] = useState('');

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['family-links', serviceUser.id],
    queryFn: () => familyLinksApi.list(serviceUser.id),
  });

  const createMut = useMutation({
    mutationFn: () => familyLinksApi.create({ serviceUserId: serviceUser.id, email, firstName, lastName, relation: relation || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family-links', serviceUser.id] });
      setEmail(''); setFirstName(''); setLastName(''); setRelation(''); setError('');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not grant access.');
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => familyLinksApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family-links', serviceUser.id] }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">Family Access — {serviceUser.firstName} {serviceUser.lastName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">People with access</h3>
            {isLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-gray-400">No family members have access yet.</p>
            ) : (
              <div className="space-y-2">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                    <div>
                      <p className="font-medium text-gray-800">{l.user.firstName} {l.user.lastName}{l.relation ? ` · ${l.relation}` : ''}</p>
                      <p className="text-xs text-gray-500">{l.user.email}</p>
                    </div>
                    <button className="btn-danger btn btn-sm" disabled={removeMut.isPending} onClick={() => removeMut.mutate(l.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Invite a family member</h3>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name *</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Relationship</label>
              <input value={relation} onChange={(e) => setRelation(e.target.value)} className="input" placeholder="e.g. Daughter" />
            </div>
            <p className="text-xs text-gray-500">
              They'll get an email with a link to set their own password and view {serviceUser.firstName}'s
              basic info, care plan, daily logs and eMAR — read only.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary btn" onClick={onClose}>Close</button>
              <button
                className="btn-primary btn"
                disabled={createMut.isPending || !email || !firstName || !lastName}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
