import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { notesApi } from '../api/notes';
import { useAuth } from '../contexts/AuthContext';

// Full-height office-notes rail docked on the right of the dashboard — a shared
// thread where admins/managers post daily updates. Live-synced via the socket.
export default function OfficeNotes() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const { data: notes = [] } = useQuery({ queryKey: ['notes'], queryFn: notesApi.list });
  // Oldest first, so the newest sits at the bottom like a chat thread.
  const ordered = [...notes].reverse();

  const createMut = useMutation({
    mutationFn: () => notesApi.create(text.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notes'] }); setText(''); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  // Keep the thread scrolled to the newest note.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [notes]);

  return (
    <aside className="hidden lg:flex w-80 shrink-0 border-l border-gray-200 bg-white flex-col">
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <p className="font-semibold text-gray-900">Office notes</p>
        <p className="text-xs text-gray-400">Daily updates — staff, service users, office</p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {ordered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No updates yet. Post the first one.</p>
        ) : (
          ordered.map((n) => (
            <div key={n.id} className="group">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{n.authorName || 'Someone'}</span>
                  {' · '}{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
                {(isAdmin || n.authorId === user?.id) && (
                  <button onClick={() => deleteMut.mutate(n.id)} className="text-xs text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                )}
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap mt-0.5 bg-gray-50 rounded-lg px-3 py-2">{n.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-200 p-2 flex gap-2 items-end shrink-0">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) createMut.mutate(); } }}
          rows={1}
          placeholder="Write an update… (Enter to send)"
          className="input resize-none text-sm flex-1 py-2"
        />
        <button className="btn-primary btn btn-sm" disabled={!text.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? '…' : 'Send'}
        </button>
      </div>
    </aside>
  );
}
