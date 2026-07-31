import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { announcementsApi } from '../api/announcements';
import { usersApi } from '../api/users';

export default function Announcements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // empty = all carers
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

  const toggleCarer = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const sortedStaff = [...staff].sort((a, b) => a.firstName.localeCompare(b.firstName));
  const q = recipientSearch.trim().toLowerCase();
  const shownStaff = sortedStaff.filter((s) => !q || `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));

  // Names of currently selected carers, in list order, for the summary + button.
  const selectedNames = sortedStaff.filter((s) => selectedIds.includes(s.id)).map((s) => `${s.firstName} ${s.lastName}`);

  const createMut = useMutation({
    mutationFn: () => announcementsApi.create({ body: body.trim(), title: title.trim() || undefined, targetUserIds: selectedIds.length ? selectedIds : undefined }),
    onSuccess: () => {
      setTitle(''); setBody(''); setSelectedIds([]); setRecipientSearch('');
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  // Names for a saved announcement's recipient list (multi), falling back to the
  // legacy single target. Returns null for a broadcast.
  const recipientLabel = (a: { targetUserId: string | null; targetUserIds?: string | null }): string | null => {
    let ids: string[] = [];
    try { ids = JSON.parse(a.targetUserIds || '[]'); } catch { ids = []; }
    if (!ids.length && a.targetUserId) ids = [a.targetUserId];
    if (!ids.length) return null;
    const names = ids.map((id) => staffName(id) || 'a carer');
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="text-sm text-gray-500">Post messages to the carer app — to everyone, or to selected carers (e.g. everyone covering one client).</p>
      </div>

      {/* Composer */}
      <div className="card space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Send to</label>
            <span className="text-xs text-gray-500">
              {selectedIds.length === 0 ? 'All carers' : `${selectedIds.length} selected`}
              {selectedIds.length > 0 && (
                <button type="button" onClick={() => setSelectedIds([])} className="ml-2 text-blue-600 hover:underline">Clear</button>
              )}
            </span>
          </div>
          <input
            value={recipientSearch}
            onChange={(e) => setRecipientSearch(e.target.value)}
            className="input mb-2"
            placeholder="🔍 Search carers…"
          />
          <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
            {/* All carers = no one ticked. Selecting any carer switches to targeted. */}
            <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 font-medium text-sm text-gray-800">
              <input type="checkbox" checked={selectedIds.length === 0} onChange={() => setSelectedIds([])} className="h-4 w-4 accent-blue-600" />
              All carers
            </label>
            {shownStaff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm text-gray-700">
                <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleCarer(s.id)} className="h-4 w-4 accent-blue-600" />
                {s.firstName} {s.lastName}
              </label>
            ))}
            {shownStaff.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No carers match “{recipientSearch}”.</p>}
          </div>
          {selectedIds.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">To: {selectedNames.join(', ')}</p>
          )}
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
            {createMut.isPending
              ? 'Posting…'
              : selectedIds.length === 0
                ? 'Post to all carers'
                : selectedIds.length === 1
                  ? `Send to ${selectedNames[0]}`
                  : `Send to ${selectedIds.length} carers`}
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
                    {recipientLabel(a)
                      ? <span className="badge-purple">To {recipientLabel(a)}</span>
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
