import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trainingApi, TrainingData } from '../api/training';
import { useAuth } from '../contexts/AuthContext';
import { User, Training } from '../types';
import { format } from 'date-fns';

interface Props {
  user: User;
  onClose: () => void;
}

const COURSES = [
  'First Aid', 'Safeguarding Adults e-learning', 'Safeguarding Children',
  'Manual Handling', 'Infection Control', 'Medication Administration',
  'Health & Safety', 'Fire Safety', 'Food Hygiene', 'GDPR / Data Protection',
  'Equality & Diversity', 'Dementia Care', 'Other',
];

interface FormState {
  course: string;
  date: string;
  expiresAt: string;
  accredited: boolean;
  description: string;
}

const emptyForm = (): FormState => ({
  course: '', date: format(new Date(), 'yyyy-MM-dd'), expiresAt: '', accredited: false, description: '',
});

function isValid(t: Training): boolean {
  if (!t.expiresAt) return true;
  return new Date(t.expiresAt) >= new Date();
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-green-600 text-green-600 text-xs">✓</span>
    : <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border-2 border-red-600 text-red-600 text-xs">✕</span>;
}

export default function TrainingModal({ user, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['training', user.id],
    queryFn: () => trainingApi.list(user.id),
  });

  // "Most Recent" shows only the latest record per course; "All" shows full history.
  const visibleRecords = showAll
    ? records
    : Object.values(
        records.reduce((acc, t) => {
          if (!acc[t.course] || new Date(t.date) > new Date(acc[t.course].date)) acc[t.course] = t;
          return acc;
        }, {} as Record<string, Training>)
      );

  const resetForm = () => { setForm(emptyForm()); setEditingId(null); };

  const saveMut = useMutation({
    mutationFn: () => {
      const data: TrainingData = {
        userId: user.id,
        course: form.course,
        date: form.date,
        expiresAt: form.expiresAt || undefined,
        accredited: form.accredited,
        description: form.description || undefined,
      };
      return editingId ? trainingApi.update(editingId, data) : trainingApi.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', user.id] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => trainingApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', user.id] }); setConfirmDeleteId(null); },
  });

  function startEdit(t: Training) {
    setEditingId(t.id);
    setForm({
      course: t.course,
      date: format(new Date(t.date), 'yyyy-MM-dd'),
      expiresAt: t.expiresAt ? format(new Date(t.expiresAt), 'yyyy-MM-dd') : '',
      accredited: t.accredited,
      description: t.description || '',
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">Training — {user.firstName} {user.lastName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!showAll} onChange={() => setShowAll(false)} /> Most Recent
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={showAll} onChange={() => setShowAll(true)} /> All
            </label>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-700 text-white">
                    <th className="text-left p-2.5 font-medium">Course</th>
                    <th className="text-left p-2.5 font-medium">Date</th>
                    <th className="text-left p-2.5 font-medium">Expires</th>
                    <th className="text-center p-2.5 font-medium">Valid</th>
                    <th className="text-center p-2.5 font-medium">Accredited</th>
                    {isManager && <th className="text-right p-2.5 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleRecords.map((t) => (
                    <tr key={t.id}>
                      <td className="p-2.5 text-gray-900">{t.course}</td>
                      <td className="p-2.5 text-gray-600">{format(new Date(t.date), 'dd-MM-yyyy')}</td>
                      <td className="p-2.5 text-gray-600">{t.expiresAt ? format(new Date(t.expiresAt), 'dd-MM-yyyy') : '—'}</td>
                      <td className="p-2.5 text-center"><StatusIcon ok={isValid(t)} /></td>
                      <td className="p-2.5 text-center"><StatusIcon ok={t.accredited} /></td>
                      {isManager && (
                        <td className="p-2.5 text-right">
                          {confirmDeleteId === t.id ? (
                            <span className="flex items-center gap-2 justify-end">
                              <span className="text-xs text-red-700">Delete?</span>
                              <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(t.id)}>Yes</button>
                              <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                            </span>
                          ) : (
                            <span className="flex gap-2 justify-end">
                              <button className="text-blue-600 text-xs hover:underline" onClick={() => startEdit(t)}>Edit</button>
                              <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(t.id)}>Delete</button>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {visibleRecords.length === 0 && (
                    <tr><td colSpan={isManager ? 6 : 5} className="p-6 text-center text-gray-400">No training recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {isManager && (
            <div className="border-t pt-5 space-y-4">
              <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Training Record' : 'Add Training Attended'}</h3>
              {(saveMut.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error && (
                <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {(saveMut.error as { response?: { data?: { error?: string } } }).response?.data?.error}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">Training Course *</label>
                  <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} className="input">
                    <option value="">Please Select</option>
                    {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Expires</label>
                  <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={form.description} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input resize-none text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.accredited} onChange={(e) => setForm({ ...form, accredited: e.target.checked })} />
                Accredited
              </label>
              <div className="flex gap-3">
                {editingId && <button className="btn-secondary btn" onClick={resetForm}>Cancel Edit</button>}
                <div className="flex-1" />
                <button
                  className="btn-primary btn"
                  disabled={!form.course || !form.date || saveMut.isPending}
                  onClick={() => saveMut.mutate()}
                >
                  {saveMut.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Training'}
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
