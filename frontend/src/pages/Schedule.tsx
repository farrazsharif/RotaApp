import { useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import enGbLocale from '@fullcalendar/core/locales/en-gb';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi } from '../api/shifts';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import ShiftModal from '../components/ShiftModal';
import { Shift } from '../types';
import { format } from 'date-fns';
import { formatTime12h } from '../lib/time';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

function userColor(userId: string | undefined, users: { id: string }[]): string {
  if (!userId) return '#9ca3af'; // gray for unassigned
  const idx = users.findIndex((u) => u.id === userId);
  return COLORS[idx % COLORS.length] || '#3b82f6';
}

function formatDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // crosses midnight
  if (mins < 60) return `${mins} mins`;
  const hours = mins / 60;
  if (mins % 60 === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function coverLabel(cover: number): string {
  return cover === 3 ? 'Triple cover' : cover === 2 ? 'Double cover' : 'Single cover';
}

export default function Schedule() {
  const { isManager, user } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [confirmPublishAll, setConfirmPublishAll] = useState(false);

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => shiftsApi.list({
      userId: isManager ? undefined : user?.id,
    }),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ active: true }),
    enabled: isManager,
  });

  const dropMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => shiftsApi.update(id, { date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const cancelAllMut = useMutation({
    mutationFn: (ids: string[]) => shiftsApi.cancelBulk(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const publishAllMut = useMutation({
    mutationFn: (ids: string[]) => shiftsApi.publishBulk(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const assignedCarers = (s: Shift) => (s.userId ? 1 : 0) + (s.coverCarers?.length ?? 0);
  const neededCarers = (s: Shift) => s.cover || 1;
  const missingCarers = (s: Shift) => Math.max(0, neededCarers(s) - assignedCarers(s));
  const needsStaff = (s: Shift) => missingCarers(s) > 0;

  const term = search.trim().toLowerCase();
  const notCancelled = shifts.filter((s) => s.status !== 'CANCELLED');
  const unassignedCount = notCancelled.filter(needsStaff).length;

  const activeShifts = notCancelled
    .filter((s) => {
      if (assignFilter === 'assigned') return !needsStaff(s);
      if (assignFilter === 'unassigned') return needsStaff(s);
      return true;
    })
    .filter((s) => {
      if (!term) return true;
      const names = [
        s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : '',
        s.user ? `${s.user.firstName} ${s.user.lastName}` : '',
        ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? []),
      ];
      return names.some((n) => n.toLowerCase().includes(term));
    });

  // Only fully-assigned drafts are eligible for publishing — understaffed
  // shifts must get a carer assigned first.
  const draftShown = activeShifts.filter((s) => !s.published && !needsStaff(s));
  const draftUnassignedShown = activeShifts.filter((s) => !s.published && needsStaff(s)).length;

  const events = activeShifts
    .map((s) => {
      const unassigned = needsStaff(s);
      const baseColor = s.serviceUser?.site?.color || userColor(s.userId, users);
      const dateStr = format(new Date(s.date), 'yyyy-MM-dd');
      return {
        id: s.id,
        title: isManager
          ? `${s.user ? `${s.user.firstName} ${s.user.lastName}` : 'Unassigned'}${s.visitName ? ` · ${s.visitName}` : s.role ? ` · ${s.role}` : ''}`
          : s.visitName || s.role || 'Shift',
        // Give events a real start/end (not just a bare date) so FullCalendar
        // orders each day's calls chronologically by visit time instead of
        // falling back to alphabetical title sorting.
        start: `${dateStr}T${s.startTime}:00`,
        end: `${dateStr}T${s.endTime}:00`,
        extendedProps: { shift: s },
        // Keep the location colour as the box background; only flag unassigned with a red border.
        backgroundColor: baseColor,
        borderColor: unassigned ? '#dc2626' : baseColor,
        textColor: '#000',
        classNames: [
          ...(unassigned ? ['unassigned-shift'] : []),
          ...(!s.published ? ['draft-shift'] : []),
        ],
      };
    });

  const handleDateClick = useCallback((arg: DateClickArg) => {
    if (!isManager) return;
    setSelectedShift(null);
    setSelectedDate(arg.dateStr);
    setModalOpen(true);
  }, [isManager]);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const shift = arg.event.extendedProps.shift as Shift;
    setSelectedShift(shift);
    setSelectedDate(undefined);
    setModalOpen(true);
  }, []);

  const handleEventDrop = useCallback((arg: EventDropArg) => {
    if (!isManager) { arg.revert(); return; }
    const shift = arg.event.extendedProps.shift as Shift;
    dropMut.mutate({ id: shift.id, date: arg.event.startStr });
  }, [isManager, dropMut]);

  function renderEventContent(arg: EventContentArg) {
    const s = arg.event.extendedProps.shift as Shift;
    const patient = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'No patient';
    const unassigned = needsStaff(s);
    const missing = missingCarers(s);
    return (
      <div className="p-0.5 overflow-hidden leading-tight">
        <p className="text-xs font-bold truncate">
          {unassigned && <span title="Unassigned call">⚠ </span>}
          {patient}
          {isManager && !s.published && (
            <span className="ml-1 text-[9px] font-bold uppercase tracking-wide bg-black/15 px-1 py-0.5 rounded">Draft</span>
          )}
        </p>
        <p className="text-[11px]">
          <span className="font-bold">{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}</span>
          <span className="opacity-90"> · {formatDuration(s.startTime, s.endTime)}</span>
        </p>
        {isManager && (
          <p className={`text-[10px] truncate ${unassigned ? 'font-bold' : 'opacity-90'}`}>
            {assignedCarers(s) === 0
              ? 'Unassigned'
              : [s.user ? `${s.user.firstName} ${s.user.lastName}` : null,
                 ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? [])].filter(Boolean).join(', ')}
            {unassigned && ` · needs ${missing} more`}
          </p>
        )}
        {(s.visitName || s.cover > 1) && (
          <p className="text-[10px] font-semibold truncate">
            {[s.visitName, s.cover > 1 ? coverLabel(s.cover) : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {s.serviceUser?.site && (
          <p className="text-[10px] opacity-90 truncate">{s.serviceUser.site.name}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        {isManager && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or carer…"
              className="input w-56 text-sm"
            />
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {([
                { k: 'all', label: 'All' },
                { k: 'assigned', label: 'Assigned' },
                { k: 'unassigned', label: `Unassigned${unassignedCount ? ` (${unassignedCount})` : ''}` },
              ] as const).map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setAssignFilter(opt.k)}
                  className={`px-3 py-1.5 transition-colors ${
                    assignFilter === opt.k
                      ? opt.k === 'unassigned' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                      : `bg-white hover:bg-gray-50 ${opt.k === 'unassigned' && unassignedCount ? 'text-red-600 font-medium' : 'text-gray-600'}`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {confirmPublishAll ? (
              <span className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-2 py-1">
                <span className="text-sm text-green-800">Publish {draftShown.length} to carer app?</span>
                <button
                  className="btn-primary btn btn-sm"
                  disabled={publishAllMut.isPending}
                  onClick={() => {
                    publishAllMut.mutate(draftShown.map((s) => s.id), { onSettled: () => setConfirmPublishAll(false) });
                  }}
                >
                  {publishAllMut.isPending ? 'Publishing…' : 'Yes, publish all'}
                </button>
                <button className="btn-secondary btn btn-sm" onClick={() => setConfirmPublishAll(false)}>No</button>
              </span>
            ) : (
              <button
                className="btn-primary btn"
                onClick={() => setConfirmPublishAll(true)}
                disabled={draftShown.length === 0}
              >
                Publish All Shown ({draftShown.length})
              </button>
            )}
            {!confirmPublishAll && draftUnassignedShown > 0 && (
              <span className="text-xs text-amber-600 font-medium">
                {draftUnassignedShown} draft{draftUnassignedShown > 1 ? 's' : ''} need{draftUnassignedShown > 1 ? '' : 's'} a carer assigned before publishing
              </span>
            )}
            {confirmCancelAll ? (
              <span className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1">
                <span className="text-sm text-red-800">Cancel {activeShifts.length}?</span>
                <button
                  className="btn-danger btn btn-sm"
                  disabled={cancelAllMut.isPending}
                  onClick={() => {
                    cancelAllMut.mutate(activeShifts.map((s) => s.id), { onSettled: () => setConfirmCancelAll(false) });
                  }}
                >
                  {cancelAllMut.isPending ? 'Cancelling…' : 'Yes, cancel all'}
                </button>
                <button className="btn-secondary btn btn-sm" onClick={() => setConfirmCancelAll(false)}>No</button>
              </span>
            ) : (
              <button
                className="btn-danger btn"
                onClick={() => setConfirmCancelAll(true)}
                disabled={activeShifts.length === 0}
              >
                Cancel All Shown ({activeShifts.length})
              </button>
            )}
            <button
              className="btn-primary btn"
              onClick={() => { setSelectedShift(null); setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setModalOpen(true); }}
            >
              + Add Shift
            </button>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={enGbLocale}
          firstDay={1}
          dayHeaderContent={(arg) =>
            arg.view.type === 'dayGridMonth' ? format(arg.date, 'EEE') : format(arg.date, 'EEE dd-MM')
          }
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={events}
          eventOrder="start"
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          editable={isManager}
          droppable={isManager}
          eventContent={renderEventContent}
          height="calc(100vh - 220px)"
          eventDisplay="block"
        />
      </div>

      {modalOpen && (
        <ShiftModal
          shift={selectedShift}
          defaultDate={selectedDate}
          onClose={() => { setModalOpen(false); setSelectedShift(null); }}
        />
      )}
    </div>
  );
}
