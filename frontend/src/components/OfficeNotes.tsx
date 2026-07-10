import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { notesApi } from '../api/notes';
import { useAuth } from '../contexts/AuthContext';

// Shared office log on the dashboard: admins/managers post daily updates about
// staff, service users and office activity. Live-synced via the global socket.
export default function OfficeNotes() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [text, setText] = useState('');

  const { data: notes = [] } = useQuery({ queryKey: ['notes'], queryFn: notesApi.list });

  const createMut = useMutation({
    mutationFn: () => notesApi.create(text.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notes'] }); setText(''); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">Office notes</h2>
        <span className="text-xs text-gray-400">Daily updates — staff, service users, office</span>
      </div>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write an update for the team…"
          className="input resize-none text-sm flex-1"
        />
        <button className="btn-primary btn self-end" disabled={!text.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No updates yet. Post the first one.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="py-2.5 group">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{n.authorName || 'Someone'}</span>
                  {' · '}{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
                {(isAdmin || n.authorId === user?.id) && (
                  <button onClick={() => deleteMut.mutate(n.id)} className="text-xs text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                )}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5">{n.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
