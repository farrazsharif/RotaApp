import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importantDatesApi, ImportantDateData } from '../api/importantDates';
import { useAuth } from '../contexts/AuthContext';
import { User, ImportantDate } from '../types';
import { format } from 'date-fns';

interface Props {
  user: User;
  onClose: () => void;
}

const COMMON_LABELS = [
  'DBS Renewal', 'Supervision', 'Appraisal', 'Contract Review', 'Probation Review', 'Other',
];

interface FormState {
  label: string;
  date: string;
  notes: string;
}

const emptyForm = (): FormState => ({ label: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });

function isOverdue(d: ImportantDate): boolean {
  return new Date(d.date) < new Date();
}

export default function ImportantDatesModal({ user, onClose }: Props) {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['important-dates', user.id],
    queryFn: () => importantDatesApi.list(user.id),
  });

  const resetForm = () => { setForm(emptyForm()); setEditingId(null); };

  const saveMut = useMutation({
    mutationFn: () => {
      const data: ImportantDateData = { userId: user.id, label: form.label, date: form.date, notes: form.notes || undefined };
      return editingId ? importantDatesApi.update(editingId, data) : importantDatesApi.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['important-dates', user.id] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => importantDatesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['important-dates', user.id] }); setConfirmDeleteId(null); },
  });

  function startEdit(d: ImportantDate) {
    setEditingId(d.id);
    setForm({ label: d.label, date: format(new Date(d.date), 'yyyy-MM-dd'), notes: d.notes || '' });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">Important Dates — {user.firstName} {user.lastName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
          ) : records.length === 0 ? (
            <p className="text-sm text-gray-400">No important dates recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {records.map((d) => (
                <div key={d.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${isOverdue(d) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.label}</p>
                    <p className={`text-xs ${isOverdue(d) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {format(new Date(d.date), 'dd MMM yyyy')}{isOverdue(d) ? ' · overdue' : ''}
                    </p>
                    {d.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{d.notes}</p>}
                  </div>
                  {isManager && (
                    confirmDeleteId === d.id ? (
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-red-700">Delete?</span>
                        <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(d.id)}>Yes</button>
                        <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                      </span>
                    ) : (
                      <span className="flex gap-2 flex-shrink-0">
                        <button className="text-blue-600 text-xs hover:underline" onClick={() => startEdit(d)}>Edit</button>
                        <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(d.id)}>Delete</button>
                      </span>
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          {isManager && (
            <div className="border-t pt-5 space-y-4">
              <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Important Date' : 'Add Important Date'}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Label *</label>
                  <select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="input">
                    <option value="">Please Select</option>
                    {COMMON_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input resize-none text-sm" />
              </div>
              <div className="flex gap-3">
                {editingId && <button className="btn-secondary btn" onClick={resetForm}>Cancel Edit</button>}
                <div className="flex-1" />
                <button className="btn-primary btn" disabled={!form.label || !form.date || saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Date'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t sticky bottom-0 bg-white">
          <div className="flex-1" />
          <button onClick={onClose} className="btn-secondary btn">Close</button>
        </div>
      </div>
    </div>
  );
}
