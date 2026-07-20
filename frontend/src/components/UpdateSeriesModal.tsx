import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi } from '../api/shifts';
import { Shift } from '../types';
import { formatTime12h } from '../lib/time';

const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
];
const ALL_DAYS = WEEKDAYS.map((d) => d.value);
const COVER = [{ v: 1, label: 'Single cover' }, { v: 2, label: 'Double cover' }, { v: 3, label: 'Triple cover' }];

// A focused "change the whole recurring visit" dialog — e.g. when a council
// moves a call's time. Pick a scope, tick the fields to change, apply. Only the
// ticked fields are sent, so untouched details stay per-occurrence.
export default function UpdateSeriesModal({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'one' | 'future' | 'days' | 'range'>('future');
  const [days, setDays] = useState<number[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [chTime, setChTime] = useState(true);
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [chCover, setChCover] = useState(false);
  const [cover, setCover] = useState(shift.cover || 1);
  const [chName, setChName] = useState(false);
  const [visitName, setVisitName] = useState(shift.visitName ?? '');
  const [chRole, setChRole] = useState(false);
  const [role, setRole] = useState(shift.role ?? '');
  const [chNotes, setChNotes] = useState(false);
  const [notes, setNotes] = useState(shift.notes ?? '');
  const [err, setErr] = useState<string | null>(null);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const nothingChecked = !chTime && !chCover && !chName && !chRole && !chNotes;
  const invalid = nothingChecked || (scope === 'days' && days.length === 0) || (chTime && (!startTime || !endTime));

  const mut = useMutation({
    mutationFn: () => {
      const data: Parameters<typeof shiftsApi.update>[1] = { assignScope: scope };
      if (scope === 'days') data.assignDays = days;
      if (scope === 'range') { data.assignFrom = from || undefined; data.assignTo = to || undefined; }
      if (chTime) { data.startTime = startTime; data.endTime = endTime; }
      if (chCover) data.cover = cover;
      if (chName) data.visitName = visitName;
      if (chRole) data.role = role;
      if (chNotes) data.notes = notes;
      return shiftsApi.update(shift.id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      onDone();
    },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not update the visits. Please try again.'),
  });

  const patient = shift.serviceUser ? `${shift.serviceUser.firstName} ${shift.serviceUser.lastName}` : 'Visit';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Update recurring visit</h2>
          <p className="text-sm text-gray-500">
            {patient} · {shift.visitName || 'Call'} · currently {formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}
          </p>
        </div>

        {/* Scope */}
        <div>
          <label className="label">Apply to</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="input">
            <option value="future">All future visits in this series</option>
            <option value="days">Certain weekdays (this date onward)</option>
            <option value="range">A date range</option>
            <option value="one">This visit only</option>
          </select>
          {scope === 'days' && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button type="button" onClick={() => setDays(days.length === ALL_DAYS.length ? [] : ALL_DAYS)} className={`px-2.5 py-1 rounded-full text-xs border ${days.length === ALL_DAYS.length ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-blue-700 border-blue-400'}`}>All 7 days</button>
              {WEEKDAYS.map((d) => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)} className={`px-2.5 py-1 rounded-full text-xs border ${days.includes(d.value) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>{d.label}</button>
              ))}
            </div>
          )}
          {scope === 'range' && (
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-700">
              <label className="flex items-center gap-1">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input py-1 text-xs" /></label>
              <label className="flex items-center gap-1">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input py-1 text-xs" /></label>
            </div>
          )}
        </div>

        {/* Fields to change */}
        <div className="space-y-2">
          <p className="label mb-0">What to change</p>

          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 font-medium text-sm text-gray-800"><input type="checkbox" checked={chTime} onChange={(e) => setChTime(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Time</label>
            {chTime && (
              <div className="flex items-center gap-2 mt-2 pl-6 text-sm">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input py-1 w-32" />
                <span className="text-gray-400">to</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input py-1 w-32" />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 font-medium text-sm text-gray-800"><input type="checkbox" checked={chCover} onChange={(e) => setChCover(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Cover level</label>
            {chCover && (
              <select value={cover} onChange={(e) => setCover(Number(e.target.value))} className="input py-1 mt-2 ml-6 w-40">
                {COVER.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 font-medium text-sm text-gray-800"><input type="checkbox" checked={chName} onChange={(e) => setChName(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Visit name</label>
            {chName && <input value={visitName} onChange={(e) => setVisitName(e.target.value)} className="input py-1 mt-2 ml-6" placeholder="e.g. Morning Call" />}
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 font-medium text-sm text-gray-800"><input type="checkbox" checked={chRole} onChange={(e) => setChRole(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Role</label>
            {chRole && <input value={role} onChange={(e) => setRole(e.target.value)} className="input py-1 mt-2 ml-6" placeholder="e.g. Senior Carer" />}
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 font-medium text-sm text-gray-800"><input type="checkbox" checked={chNotes} onChange={(e) => setChNotes(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Notes</label>
            {chNotes && <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input py-1 mt-2 ml-6 resize-none" />}
          </div>

          <p className="text-xs text-gray-500">Only the ticked fields change — everything else stays as it is on each visit. The carer isn’t changed here; use the schedule to (re)assign carers.</p>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary btn">Cancel</button>
          <button type="button" onClick={() => mut.mutate()} disabled={mut.isPending || invalid} className="btn-primary btn">
            {mut.isPending ? 'Updating…' : 'Update Series'}
          </button>
        </div>
      </div>
    </div>
  );
}
