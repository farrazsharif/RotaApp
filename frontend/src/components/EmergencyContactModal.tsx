import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types';

interface Props {
  user: User;
  onClose: () => void;
}

export default function EmergencyContactModal({ user, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [name, setName] = useState(user.emergencyContactName || '');
  const [phone, setPhone] = useState(user.emergencyContactPhone || '');
  const [relation, setRelation] = useState(user.emergencyContactRelation || '');

  const saveMut = useMutation({
    mutationFn: () => usersApi.update(user.id, {
      emergencyContactName: name || undefined,
      emergencyContactPhone: phone || undefined,
      emergencyContactRelation: relation || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">Emergency Contact — {user.firstName} {user.lastName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
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
          <div className="flex gap-3 pt-2">
            <div className="flex-1" />
            <button className="btn-secondary btn" onClick={onClose}>Close</button>
            {isManager && (
              <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
