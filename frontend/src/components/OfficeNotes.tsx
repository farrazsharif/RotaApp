import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, addDays, addMonths,
} from 'date-fns';
import { notesApi } from '../api/notes';
import { useAuth } from '../contexts/AuthContext';
import AutoGrowTextarea from './AutoGrowTextarea';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Full-height notes rail docked on the right of the dashboard. A month calendar
// picks a day; the list shows that day's notes. Live-synced via the socket.
export default function OfficeNotes() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [text, setText] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));

  const { data: notes = [] } = useQuery({ queryKey: ['notes'], queryFn: notesApi.list });

  // Which days have at least one note (for the calendar dots).
  const daysWithNotes = new Set(notes.map((n) => format(new Date(n.createdAt), 'yyyy-MM-dd')));

  // Notes for the selected day, newest first.
  const dayNotes = notes
    .filter((n) => isSameDay(new Date(n.createdAt), selectedDate))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  const createMut = useMutation({
    mutationFn: () => notesApi.create(text.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setText('');
      // A new note is posted for today — jump there so it's visible.
      const now = new Date();
      setSelectedDate(now);
      setCalMonth(startOfMonth(now));
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });

  const gridStart = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 });
  const gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function goToday() {
    const now = new Date();
    setSelectedDate(now);
    setCalMonth(startOfMonth(now));
  }

  return (
    <aside className="hidden lg:flex w-80 shrink-0 border-l border-gray-200 bg-white flex-col">
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <p className="font-semibold text-gray-900">Notes</p>
        <p className="text-xs text-gray-400">Daily updates — staff, service users, office</p>
      </div>

      {/* Month calendar */}
      <div className="px-3 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <button onClick={() => setCalMonth((m) => addMonths(m, -1))} className="text-blue-600 text-lg px-2 leading-none">‹</button>
          <button onClick={goToday} className="text-sm font-semibold text-gray-800">{format(calMonth, 'MMMM yyyy')}</button>
          <button onClick={() => setCalMonth((m) => addMonths(m, 1))} className="text-blue-600 text-lg px-2 leading-none">›</button>
        </div>
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-gray-400 py-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const inMonth = isSameMonth(day, calMonth);
            const selected = isSameDay(day, selectedDate);
            const todayCell = isToday(day);
            const hasNotes = daysWithNotes.has(format(day, 'yyyy-MM-dd'));
            return (
              <button key={day.toISOString()} onClick={() => setSelectedDate(day)} className="flex flex-col items-center py-0.5">
                <span className={`h-7 w-7 flex items-center justify-center rounded-full text-xs ${
                  selected ? 'bg-blue-600 text-white font-semibold'
                  : todayCell ? 'text-blue-600 font-bold ring-1 ring-blue-300'
                  : inMonth ? 'text-gray-700' : 'text-gray-300'
                }`}>
                  {format(day, 'd')}
                </span>
                <span className={`h-1 w-1 rounded-full mt-0.5 ${hasNotes && !selected ? 'bg-blue-500' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day's notes */}
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 shrink-0">
        {isToday(selectedDate) ? 'Today · ' : ''}{format(selectedDate, 'EEE d MMM yyyy')}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 min-h-0">
        {dayNotes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            {isToday(selectedDate) ? 'No updates yet. Post the first one.' : 'No notes on this day.'}
          </p>
        ) : (
          dayNotes.map((n) => (
            <div key={n.id} className="group">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{n.authorName || 'Someone'}</span>
                  {' · '}{format(new Date(n.createdAt), 'h:mm a')}
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
        <AutoGrowTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) createMut.mutate(); } }}
          minRows={1}
          placeholder="Write an update… (Enter to send)"
          className="input text-sm flex-1 py-2"
        />
        <button className="btn-primary btn btn-sm" disabled={!text.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? '…' : 'Send'}
        </button>
      </div>
    </aside>
  );
}
