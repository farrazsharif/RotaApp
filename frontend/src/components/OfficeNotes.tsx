import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { notesApi } from '../api/notes';
import { useAuth } from '../contexts/AuthContext';

// Floating, collapsible office-notes panel docked bottom-right — a shared chat
// where admins/managers post daily updates. Live-synced via the global socket.
export default function OfficeNotes() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(true);
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

  // Keep the thread scrolled to the latest note.
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [notes, open]);

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)]">
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white text-left"
        >
          <div>
            <p className="font-medium text-sm">Office notes</p>
            {!open && <p className="text-[11px] text-blue-100">{notes.length} update{notes.length === 1 ? '' : 's'} · tap to open</p>}
          </div>
          <span className="text-lg leading-none">{open ? '−' : '+'}</span>
        </button>

        {open && (
          <>
            <div ref={listRef} className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: '48vh' }}>
              {ordered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No updates yet. Post the first one.</p>
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

            <div className="border-t p-2 flex gap-2 items-end">
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
          </>
        )}
      </div>
    </div>
  );
}
