import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { announcementsApi } from '../api/announcements';
import { usersApi } from '../api/users';

export default function Announcements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetUserId, setTargetUserId] = useState(''); // '' = all carers
  const [recipientSearch, setRecipientSearch] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['announcements', 'all'],
    queryFn: announcementsApi.listAll,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });
  const staffName = (id: string | null) => {
    if (!id) return null;
    const u = staff.find((s) => s.id === id);
    return u ? `${u.firstName} ${u.lastName}` : 'a carer';
  };

  const createMut = useMutation({
    mutationFn: () => announcementsApi.create({ body: body.trim(), title: title.trim() || undefined, targetUserId: targetUserId || undefined }),
    onSuccess: () => {
      setTitle(''); setBody(''); setTargetUserId('');
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="text-sm text-gray-500">Post messages to the carer app — to everyone, or to one carer.</p>
      </div>

      {/* Composer */}
      <div className="card space-y-3">
        <div>
          <label className="label">Send to</label>
          <input
            value={recipientSearch}
            onChange={(e) => setRecipientSearch(e.target.value)}
            className="input mb-2"
            placeholder="🔍 Search carers…"
          />
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className="input">
            <option value="">All carers</option>
            {[...staff]
              .sort((a, b) => a.firstName.localeCompare(b.firstName))
              // Filter by the search term, but always keep the currently selected
              // carer in the list so the dropdown never shows a blank selection.
              .filter((s) => {
                const q = recipientSearch.trim().toLowerCase();
                return !q || s.id === targetUserId || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q);
              })
              .map((s) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Title (optional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Team meeting Friday" />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="input resize-none" placeholder="Write your message…" />
        </div>
        <div className="flex justify-end">
          <button
            className="btn-primary btn"
            disabled={!body.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? 'Posting…' : targetUserId ? `Send to ${staffName(targetUserId)}` : 'Post to all carers'}
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No announcements yet</div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.targetUserId
                      ? <span className="badge-purple">To {staffName(a.targetUserId)}</span>
                      : <span className="badge-blue">All carers</span>}
                    <span className="text-xs text-gray-400">{a.authorName} · {format(new Date(a.createdAt), 'dd MMM yyyy, h:mm a')}</span>
                  </div>
                  {a.title && <p className="font-semibold text-gray-900 mt-1">{a.title}</p>}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{a.body}</p>
                </div>
                <button className="text-xs text-red-600 hover:underline shrink-0" onClick={() => deleteMut.mutate(a.id)} disabled={deleteMut.isPending}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
