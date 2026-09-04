import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { serviceUserNotesApi, ServiceUserNote, ServiceUserNoteCategory } from '../api/serviceUserNotes';
import AutoGrowTextarea from './AutoGrowTextarea';

const CATEGORIES: { value: ServiceUserNoteCategory; label: string; badge: string }[] = [
  { value: 'GENERAL', label: 'General', badge: 'bg-gray-100 text-gray-700' },
  { value: 'COUNCIL', label: 'Council update', badge: 'bg-blue-100 text-blue-700' },
  { value: 'SOCIAL_WORK', label: 'Social work', badge: 'bg-purple-100 text-purple-700' },
  { value: 'SAFEGUARDING', label: 'Safeguarding', badge: 'bg-red-100 text-red-700' },
  { value: 'CONTACT', label: 'Contact / call', badge: 'bg-amber-100 text-amber-700' },
];
const META = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

// Per-client office notes — office staff log general notes and updates received
// from the council or social work. Newest first, pinned notes on top.
export default function ServiceUserNotes({ serviceUserId, canManage }: { serviceUserId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const key = ['service-user-notes', serviceUserId];
  const { data: notes = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => serviceUserNotesApi.list(serviceUserId),
  });

  const [category, setCategory] = useState<ServiceUserNoteCategory>('GENERAL');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const createMut = useMutation({
    mutationFn: () => serviceUserNotesApi.create({ serviceUserId, category, body: body.trim() }),
    onSuccess: () => { setBody(''); setCategory('GENERAL'); invalidate(); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; body?: string; pinned?: boolean; category?: ServiceUserNoteCategory }) =>
      serviceUserNotesApi.update(v.id, v),
    onSuccess: () => { setEditing(null); invalidate(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => serviceUserNotesApi.remove(id),
    onSuccess: invalidate,
  });

  function startEdit(n: ServiceUserNote) {
    setEditing(n.id);
    setEditBody(n.body);
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Office Notes</h2>
          <p className="text-xs text-gray-500">Internal log — general notes and updates from the council or social work.</p>
        </div>
      </div>

      {canManage && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium border transition ${
                  category === c.value ? `${c.badge} border-transparent ring-1 ring-inset ring-black/10` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <AutoGrowTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minRows={3}
            placeholder="Write a note… e.g. Council increased package to 4 calls/day from 1 Aug; confirmed by social worker Jane Doe."
            className="input w-full"
          />
          <div className="flex justify-end">
            <button
              className="btn-primary btn btn-sm"
              disabled={!body.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 py-2">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const meta = META[n.category] || META.GENERAL;
            return (
              <div key={n.id} className={`rounded-lg border p-3 ${n.pinned ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
                  {n.pinned && <span className="text-xs text-amber-600">📌 Pinned</span>}
                  <span className="flex-1" />
                  <span className="text-xs text-gray-400">
                    {n.createdByName} · {format(new Date(n.createdAt), 'dd MMM yyyy, h:mm a')}
                    {n.updatedAt !== n.createdAt && ' · edited'}
                  </span>
                </div>

                {editing === n.id ? (
                  <div className="space-y-2">
                    <AutoGrowTextarea value={editBody} onChange={(e) => setEditBody(e.target.value)} minRows={3} className="input w-full" />
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      <button
                        className="btn-primary btn btn-sm"
                        disabled={!editBody.trim() || updateMut.isPending}
                        onClick={() => updateMut.mutate({ id: n.id, body: editBody.trim() })}
                      >
                        {updateMut.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
                    {canManage && (
                      <div className="flex items-center gap-3 mt-2">
                        <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => updateMut.mutate({ id: n.id, pinned: !n.pinned })}>
                          {n.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button className="text-xs text-blue-600 hover:underline" onClick={() => startEdit(n)}>Edit</button>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          disabled={deleteMut.isPending}
                          onClick={() => { if (window.confirm('Delete this note?')) deleteMut.mutate(n.id); }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
