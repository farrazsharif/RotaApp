import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { placementsApi } from '../api/placements';
import { Placement, ServiceUser, User } from '../types';
import { format } from 'date-fns';

interface Props {
  placement?: Placement | null;              // editing an existing one
  defaults?: { serviceUserId?: string; startDate?: string; endDate?: string };
  clients: ServiceUser[];                     // live-in clients
  carers: User[];                             // active carers
  onClose: () => void;
}

const iso = (d: string) => (d ? format(new Date(d), 'yyyy-MM-dd') : '');

export default function PlacementModal({ placement, defaults, clients, carers, onClose }: Props) {
  const qc = useQueryClient();
  const editing = !!placement;

  const [serviceUserId, setServiceUserId] = useState(placement?.serviceUserId || defaults?.serviceUserId || '');
  const [carerId, setCarerId] = useState(placement?.carerId || '');
  const [startDate, setStartDate] = useState(iso(placement?.startDate || defaults?.startDate || ''));
  const [endDate, setEndDate] = useState(iso(placement?.endDate || defaults?.endDate || defaults?.startDate || ''));
  const [nightType, setNightType] = useState<'SLEEP_IN' | 'WAKING'>(placement?.nightType || 'SLEEP_IN');
  const [status, setStatus] = useState<Placement['status']>(placement?.status || 'SCHEDULED');
  const [note, setNote] = useState(placement?.note || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['placements'] });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { serviceUserId, carerId, startDate, endDate, nightType, status, note };
      return editing ? placementsApi.update(placement!.id, body) : placementsApi.create(body);
    },
    onSuccess: () => { invalidate(); onClose(); },
  });
  const deleteMut = useMutation({
    mutationFn: () => placementsApi.remove(placement!.id),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const valid = serviceUserId && carerId && startDate && endDate && endDate >= startDate;
  const days = valid ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1 : 0;
  const err = (saveMut.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{editing ? 'Edit placement' : 'New live-in placement'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">Client</label>
            <select value={serviceUserId} onChange={(e) => setServiceUserId(e.target.value)} className="input">
              <option value="">Select a live-in client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Live-in carer</label>
            <select value={carerId} onChange={(e) => setCarerId(e.target.value)} className="input">
              <option value="">Select a carer…</option>
              {carers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); }} className="input" />
            </div>
            <div>
              <label className="label">End date</label>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
            </div>
          </div>
          {days > 0 && <p className="text-xs text-gray-500">{days} day{days === 1 ? '' : 's'} of live-in cover.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nights</label>
              <select value={nightType} onChange={(e) => setNightType(e.target.value as 'SLEEP_IN' | 'WAKING')} className="input">
                <option value="SLEEP_IN">Sleep-in</option>
                <option value="WAKING">Waking night</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Placement['status'])} className="input">
                <option value="SCHEDULED">Scheduled</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)} className="input resize-none text-sm" placeholder="Handover notes, access, anything the carer should know…" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center gap-3 p-4 border-t sticky bottom-0 bg-white">
          {editing && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700">Delete?</span>
                <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Yes</button>
                <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
              </div>
            ) : (
              <button className="text-sm text-red-600 hover:underline" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="btn-secondary btn">Cancel</button>
          <button className="btn-primary btn" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
