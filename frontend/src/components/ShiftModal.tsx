import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, CreateShiftData } from '../api/shifts';
import { usersApi } from '../api/users';
import { runsApi } from '../api/runs';
import { CancelBillingFields, CancelBillingValue, emptyCancelBilling, toCancelBilling } from './CancelBillingFields';
import { serviceUsersApi } from '../api/serviceUsers';
import { useAuth } from '../contexts/AuthContext';
import { Shift } from '../types';
import { format } from 'date-fns';
import { VISIT_PRESETS } from '../lib/visits';

interface Props {
  shift?: Shift | null;
  defaultDate?: string;
  onClose: () => void;
}

interface FormValues {
  userId: string;
  serviceUserId: string;
  date: string;
  startTime: string;
  endTime: string;
  visitName: string;
  cover: number;
  role: string;
  notes: string;
}

const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
];
const ALL_DAYS = WEEKDAYS.map((d) => d.value);

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function ShiftModal({ shift, defaultDate, onClose }: Props) {
  const qc = useQueryClient();
  const { isManager } = useAuth();
  const readOnly = !isManager;
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>();
  const cover = Number(watch('cover')) || 1;
  const [coverCarerIds, setCoverCarerIds] = useState<string[]>([]);
  const [runId, setRunId] = useState<string>('');
  const watchedUserId = watch('userId');
  const watchedStart = watch('startTime');
  const watchedEnd = watch('endTime');
  const assignedIds = [watchedUserId, ...coverCarerIds].filter(Boolean) as string[];

  function addCarer(id: string) {
    if (assignedIds.includes(id) || assignedIds.length >= cover) return;
    if (!watchedUserId) setValue('userId', id);
    else setCoverCarerIds((prev) => [...prev, id].slice(0, Math.max(0, cover - 1)));
  }

  function removeCarer(id: string) {
    if (watchedUserId === id) {
      // Promote the first cover carer (if any) into the primary slot so the
      // remaining assignment stays contiguous.
      const [next, ...rest] = coverCarerIds;
      setValue('userId', next || '');
      setCoverCarerIds(rest);
    } else {
      setCoverCarerIds((prev) => prev.filter((cid) => cid !== id));
    }
  }

  function durationLabel(start?: string, end?: string): string {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatEndType, setRepeatEndType] = useState<'date' | 'permanent'>('date');
  const [repeatEndDate, setRepeatEndDate] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelScope, setCancelScope] = useState<'one' | 'future' | 'days'>('one');
  const [cancelDays, setCancelDays] = useState<number[]>([]);
  const [cancelBilling, setCancelBilling] = useState<CancelBillingValue>(emptyCancelBilling);

  const [assignScope, setAssignScope] = useState<'one' | 'future' | 'days' | 'range'>('one');
  const [assignDays, setAssignDays] = useState<number[]>([]);
  const [assignFrom, setAssignFrom] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [visitNameCustomOpen, setVisitNameCustomOpen] = useState(false);

  // Include inactive staff too so they can still be assigned; each row shows an Active/Inactive badge.
  const { data: users = [] } = useQuery({ queryKey: ['users', 'all'], queryFn: () => usersApi.list() });
  // Runs are a manager-only concept; carers open the modal read-only.
  const { data: runs = [] } = useQuery({ queryKey: ['runs'], queryFn: runsApi.list, enabled: isManager });
  const { data: serviceUsersRaw = [] } = useQuery({ queryKey: ['service-users', ''], queryFn: () => serviceUsersApi.list() });
  const serviceUsers = [...serviceUsersRaw].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, undefined, { sensitivity: 'base' })
  );

  useEffect(() => {
    setRepeatEnabled(false);
    setRepeatDays([]);
    setRepeatEndType('date');
    setRepeatEndDate('');
    setCancelOpen(false);
    setCancelScope('one');
    setCancelDays([]);
    setCancelBilling(emptyCancelBilling);
    setAssignScope('one');
    setAssignDays([]);
    setAssignFrom(shift ? format(new Date(shift.date), 'yyyy-MM-dd') : '');
    setAssignTo('');
    setCoverCarerIds(shift?.coverCarers?.map((c) => c.id) ?? []);
    setRunId(shift?.runId || '');
    if (shift) {
      reset({
        userId: shift.userId || '',
        serviceUserId: shift.serviceUserId || '',
        date: format(new Date(shift.date), 'yyyy-MM-dd'),
        startTime: shift.startTime,
        endTime: shift.endTime,
        visitName: shift.visitName || '',
        cover: shift.cover || 1,
        role: shift.role || '',
        notes: shift.notes || '',
      });
      setVisitNameCustomOpen(!!shift.visitName && !VISIT_PRESETS.includes(shift.visitName));
    } else {
      reset({ userId: '', date: defaultDate || format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', endTime: '17:00', serviceUserId: '', visitName: '' });
      setVisitNameCustomOpen(false);
    }
  }, [shift, defaultDate, reset]);

  // A <select> can't hold a value until its matching <option> exists. If the
  // service-user list finishes loading after the modal's reset(), the patient
  // field ends up blank even though the shift has one — re-apply it once the
  // options are present (only while still empty, so it never clobbers an edit).
  useEffect(() => {
    if (shift?.serviceUserId && serviceUsers.length > 0 && !watch('serviceUserId')) {
      setValue('serviceUserId', shift.serviceUserId, { shouldValidate: true });
    }
  }, [serviceUsers, shift, setValue, watch]);

  function selectVisitPreset(preset: string) {
    setValue('visitName', preset, { shouldValidate: true });
    setVisitNameCustomOpen(false);
  }

  function selectVisitOther() {
    setVisitNameCustomOpen(true);
    if (VISIT_PRESETS.includes(watch('visitName'))) setValue('visitName', '', { shouldValidate: false });
  }

  // Shared by the create form and the edit two-pane view: preset chips plus
  // an "Other…" option that reveals a free-text box for anything else. The
  // text input stays mounted (just visually hidden) so react-hook-form keeps
  // its ref and validation regardless of which mode is active.
  function renderVisitNamePicker(required: boolean) {
    const currentValue = watch('visitName');
    return (
      <div>
        <label className="label">Visit Name{required ? ' *' : ''}</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {VISIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => selectVisitPreset(preset)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                currentValue === preset
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            onClick={selectVisitOther}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              visitNameCustomOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Other…
          </button>
        </div>
        <input
          {...register('visitName', required ? { required: true } : {})}
          placeholder="Enter a call name"
          className={visitNameCustomOpen ? 'input' : 'hidden'}
        />
        {errors.visitName && <p className="text-xs text-red-500 mt-1">Required</p>}
      </div>
    );
  }

  function toggleRepeatDay(d: number) {
    setRepeatDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]));
  }

  const createMut = useMutation({
    mutationFn: (data: CreateShiftData) => shiftsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); onClose(); },
  });

  // Patch the cached schedule so an edit/assignment shows instantly, before the
  // network round-trip finishes. Mirrors the backend's visit-identity matching
  // for the wider scopes; the follow-up refetch reconciles any difference.
  const optimisticAssign = (data: Partial<CreateShiftData>) => {
    const au = users.find((u) => u.id === data.userId);
    const assignedUser = au ? { id: au.id, firstName: au.firstName, lastName: au.lastName, email: au.email, role: au.role } : undefined;
    const coverList = (data.coverCarerIds ?? [])
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is typeof users[number] => !!u)
      .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }));

    const openedDate = new Date(shift!.date);
    const vName = data.visitName ?? shift!.visitName ?? undefined;
    const sTime = data.startTime ?? shift!.startTime;
    const eTime = data.endTime ?? shift!.endTime;
    const rl = (data.role ?? shift!.role) ?? undefined;
    const from = assignFrom ? new Date(`${assignFrom}T00:00:00`) : openedDate;
    const to = assignTo ? new Date(`${assignTo}T23:59:59`) : from;

    const matchesSibling = (s: Shift) => {
      if (assignScope === 'one' || s.id === shift!.id) return false;
      if (s.serviceUserId !== shift!.serviceUserId) return false;
      if ((s.visitName ?? undefined) !== vName || s.startTime !== sTime || s.endTime !== eTime) return false;
      if ((s.role ?? undefined) !== rl) return false;
      const d = new Date(s.date);
      if (assignScope === 'range') return d >= from && d <= to;
      if (d < openedDate) return false;
      if (assignScope === 'days') return assignDays.includes(d.getDay());
      return true; // future
    };

    const carerPatch = { userId: data.userId || undefined, user: assignedUser, coverCarers: coverList };
    qc.setQueriesData<Shift[]>({ queryKey: ['shifts'] }, (old) =>
      Array.isArray(old)
        ? old.map((s) => {
            if (s.id === shift!.id) {
              return {
                ...s, ...carerPatch,
                cover: typeof data.cover === 'number' ? data.cover : s.cover,
                visitName: data.visitName ?? s.visitName,
                startTime: data.startTime ?? s.startTime,
                endTime: data.endTime ?? s.endTime,
                role: data.role ?? s.role,
                notes: data.notes ?? s.notes,
              };
            }
            return matchesSibling(s) ? { ...s, ...carerPatch } : s;
          })
        : old,
    );
  };

  const updateMut = useMutation({
    mutationFn: async ({ data, publishAfter }: { data: Partial<CreateShiftData>; publishAfter: boolean }) => {
      // Optimistic: reflect the change on the board and close the modal
      // immediately, then save in the background — so saving feels instant even
      // though the assignment fans out to many future shifts server-side.
      await qc.cancelQueries({ queryKey: ['shifts'] });
      const snapshots = qc.getQueriesData<Shift[]>({ queryKey: ['shifts'] });
      optimisticAssign(data);
      onClose();

      // 1) Save the edit/assignment. Only this step rolls back on failure.
      try {
        await shiftsApi.update(shift!.id, data);
        // Propagate the carer to the wider scope (weekdays / date range / all
        // future) via visit-identity matching on the backend.
        if (assignScope !== 'one') {
          await shiftsApi.assignCarer(shift!.id, {
            userId: data.userId,
            coverCarerIds: data.coverCarerIds,
            scope: assignScope,
            days: assignScope === 'days' ? assignDays : undefined,
            fromDate: assignScope === 'range' ? assignFrom || undefined : undefined,
            toDate: assignScope === 'range' ? assignTo || undefined : undefined,
          });
        }
      } catch (err) {
        // Roll back to the pre-optimistic state and surface the real reason.
        snapshots.forEach(([key, prev]) => qc.setQueryData(key, prev));
        qc.invalidateQueries({ queryKey: ['shifts'] });
        const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        alert(detail ? `Could not save the shift: ${detail}` : 'Could not save the shift — please try again.');
        return;
      }

      // 2) Optional publish. A publish rejection (e.g. the call still needs a
      // carer) must NOT undo the save above — just tell the user why.
      if (publishAfter) {
        try {
          await shiftsApi.publish(shift!.id);
        } catch (err) {
          const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          alert(detail ? `Saved, but not published: ${detail}` : 'Saved, but publishing failed — try Publish again.');
        }
      }
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => shiftsApi.publish(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); onClose(); },
  });

  const deleteMut = useMutation({
    mutationFn: (opts?: Parameters<typeof shiftsApi.delete>[1]) => shiftsApi.delete(shift!.id, opts),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); onClose(); },
  });

  function toggleCancelDay(d: number) {
    setCancelDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]));
  }

  function toggleAssignDay(d: number) {
    setAssignDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]));
  }

  function onSubmit(values: FormValues, publishAfter = false) {
    const data: CreateShiftData = {
      // null (not undefined) so an unassignment is sent and actually clears the
      // carer — undefined would be dropped from the JSON and left unchanged.
      userId: values.userId || null,
      serviceUserId: values.serviceUserId || undefined,
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      visitName: values.visitName || undefined,
      cover: Number(values.cover) || 1,
      coverCarerIds: coverCarerIds.slice(0, Math.max(0, (Number(values.cover) || 1) - 1)).filter(Boolean),
      role: values.role || undefined,
      notes: values.notes || undefined,
      // null (not undefined) so clearing the run actually removes it.
      runId: runId || null,
    };
    if (!shift && repeatEnabled && repeatDays.length > 0) {
      data.repeat = {
        daysOfWeek: repeatDays,
        endType: repeatEndType,
        endDate: repeatEndType === 'date' ? repeatEndDate || undefined : undefined,
      };
    }
    if (shift) {
      updateMut.mutate({ data, publishAfter });
    } else {
      createMut.mutate(data, publishAfter ? { onSuccess: (created) => publishMut.mutate(created.id) } : undefined);
    }
  }

  const onSave = handleSubmit((values) => onSubmit(values, false));
  const onSaveAndPublish = handleSubmit((values) => onSubmit(values, true));

  const isPending = createMut.isPending || updateMut.isPending;
  const error = (createMut.error || updateMut.error) as { response?: { data?: { error?: string } } } | null;

  // Assignment state shared by both the create form and the edit two-pane view.
  const assignedUsers = assignedIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users;
  const availableUsers = users.filter(
    (u) => !assignedIds.includes(u.id) && `${u.firstName} ${u.lastName}`.toLowerCase().includes(employeeSearch.trim().toLowerCase())
  );
  const fullyAssigned = assignedIds.length >= cover;

  // The two-pane Employee Assignment layout only applies when a manager is
  // editing an existing shift — creating a new shift keeps the original
  // single-column form unchanged.
  if (!shift || readOnly) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-6 sm:my-0 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b shrink-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {readOnly ? 'Visit Details' : shift ? 'Edit Shift' : 'New Shift'}
            {shift && !shift.published && (
              <span className="text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Draft</span>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <form onSubmit={onSave} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error.response?.data?.error || 'An error occurred'}
            </div>
          )}

          <fieldset disabled={readOnly} className="space-y-4 border-0 p-0 m-0 disabled:opacity-90">
          <div>
            <label className="label">Service User (Patient) *</label>
            <select {...register('serviceUserId', { required: true })} value={watch('serviceUserId') ?? ''} className="input">
              <option value="">Select a patient…</option>
              {serviceUsers.map((su) => (
                <option key={su.id} value={su.id}>
                  {su.firstName} {su.lastName}{su.postcode ? ` — ${su.postcode}` : ''}
                </option>
              ))}
            </select>
            {errors.serviceUserId && <p className="text-xs text-red-500 mt-1">Required</p>}
          </div>

          {renderVisitNamePicker(true)}

          <div>
            <label className="label">Date *</label>
            <input type="date" {...register('date', { required: true })} className="input" />
            {errors.date && <p className="text-xs text-red-500 mt-1">Required</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Time *</label>
              <input type="time" {...register('startTime', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input type="time" {...register('endTime', { required: true })} className="input" />
            </div>
          </div>
          {watchedStart && watchedEnd && (
            <p className="text-sm text-gray-600 -mt-1">Duration: <span className="font-medium text-gray-800">{durationLabel(watchedStart, watchedEnd)}</span></p>
          )}

          <div>
            <label className="label">Cover *</label>
            <select {...register('cover', { required: true, valueAsNumber: true })} className="input">
              <option value="">Select cover…</option>
              <option value={1}>Single cover (1 carer)</option>
              <option value={2}>Double cover (2 carers)</option>
              <option value={3}>Triple cover (3 carers)</option>
            </select>
            {errors.cover && <p className="text-xs text-red-500 mt-1">Required</p>}
          </div>

          <div>
            <label className="label">Carers</label>
            {!readOnly && (
              <p className="text-xs text-gray-500 mb-2">{assignedIds.length} of {cover} slot{cover > 1 ? 's' : ''} filled — leave unchecked to assign later.</p>
            )}
            {!readOnly && (
              <input
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search by employee name"
                className="input mb-2"
              />
            )}
            <div className="mb-2">
              {!readOnly && <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Who's Working ({assignedUsers.length})</p>}
              {assignedUsers.length === 0 ? (
                <p className="text-sm text-gray-400">No one assigned yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {assignedUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked onChange={() => removeCarer(u.id)} className="h-4 w-4 accent-blue-600" />
                      <span className="text-sm text-gray-800">{u.firstName} {u.lastName}</span>
                      <StatusBadge active={u.active} />
                    </label>
                  ))}
                </div>
              )}
            </div>
            {!readOnly && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Available ({availableUsers.length})</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {availableUsers.map((u) => (
                    <label
                      key={u.id}
                      title={fullyAssigned ? 'All cover slots are filled' : 'Add to this shift'}
                      className={`flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 ${fullyAssigned ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                    >
                      <input type="checkbox" checked={false} disabled={fullyAssigned} onChange={() => addCarer(u.id)} className="h-4 w-4 accent-blue-600" />
                      <span className="text-sm text-gray-800">{u.firstName} {u.lastName}</span>
                      <StatusBadge active={u.active} />
                    </label>
                  ))}
                  {availableUsers.length === 0 && <p className="text-sm text-gray-400">No matching employees.</p>}
                </div>
              </div>
            )}

            {shift?.seriesId && (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 space-y-2 text-sm">
                <p className="text-xs text-blue-800 font-medium">Recurring visit — apply carer to:</p>
                <label className="flex items-center gap-2">
                  <input type="radio" name="assignScope" checked={assignScope === 'one'} onChange={() => setAssignScope('one')} />
                  This shift only
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="assignScope" checked={assignScope === 'days'} onChange={() => setAssignScope('days')} />
                  Certain weekdays (this date onward)
                </label>
                {assignScope === 'days' && (
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    <button
                      type="button"
                      onClick={() => setAssignDays(assignDays.length === ALL_DAYS.length ? [] : ALL_DAYS)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        assignDays.length === ALL_DAYS.length
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-blue-700 border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      All 7 days
                    </button>
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleAssignDay(d.value)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          assignDays.includes(d.value)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input type="radio" name="assignScope" checked={assignScope === 'range'} onChange={() => setAssignScope('range')} />
                  Cover a date range (e.g. holiday cover)
                </label>
                {assignScope === 'range' && (
                  <div className="flex flex-wrap items-center gap-3 pl-6 text-xs text-gray-700">
                    <label className="flex items-center gap-1">From <input type="date" value={assignFrom} onChange={(e) => setAssignFrom(e.target.value)} className="input py-1 text-xs" /></label>
                    <label className="flex items-center gap-1">To <input type="date" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="input py-1 text-xs" /></label>
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input type="radio" name="assignScope" checked={assignScope === 'future'} onChange={() => setAssignScope('future')} />
                  All future shifts in this series
                </label>
              </div>
            )}
          </div>

          {!readOnly && runs.length > 0 && (
            <div>
              <label className="label">Run <span className="text-gray-400 font-normal">(optional)</span></label>
              <select value={runId} onChange={(e) => setRunId(e.target.value)} className="input">
                <option value="">No run</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} rows={2} className="input resize-none" />
          </div>

          {!shift && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={repeatEnabled} onChange={(e) => setRepeatEnabled(e.target.checked)} />
                Repeat this visit
              </label>

              {repeatEnabled && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Repeat on</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRepeatDays(repeatDays.length === ALL_DAYS.length ? [] : ALL_DAYS)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          repeatDays.length === ALL_DAYS.length
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-blue-700 border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        All 7 days
                      </button>
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleRepeatDay(d.value)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            repeatDays.includes(d.value)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">Ends</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="repeatEnd" checked={repeatEndType === 'date'} onChange={() => setRepeatEndType('date')} />
                        On date
                        {repeatEndType === 'date' && (
                          <input
                            type="date"
                            value={repeatEndDate}
                            onChange={(e) => setRepeatEndDate(e.target.value)}
                            className="input ml-2 py-1 text-sm"
                          />
                        )}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="repeatEnd" checked={repeatEndType === 'permanent'} onChange={() => setRepeatEndType('permanent')} />
                        Permanent
                      </label>
                    </div>
                  </div>

                  {repeatDays.length === 0 && (
                    <p className="text-xs text-amber-600">Select at least one day to repeat.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {cancelOpen && shift && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
              <p className="text-sm font-medium text-red-800">Cancel this visit</p>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="cancelScope" checked={cancelScope === 'one'} onChange={() => setCancelScope('one')} />
                  This shift only
                </label>
                {shift.seriesId && (
                  <>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cancelScope" checked={cancelScope === 'days'} onChange={() => setCancelScope('days')} />
                      Certain weekdays (this date onward)
                    </label>
                    {cancelScope === 'days' && (
                      <div className="flex flex-wrap gap-1.5 pl-6">
                        <button
                          type="button"
                          onClick={() => setCancelDays(cancelDays.length === ALL_DAYS.length ? [] : ALL_DAYS)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            cancelDays.length === ALL_DAYS.length
                              ? 'bg-red-700 text-white border-red-700'
                              : 'bg-white text-red-700 border-red-400 hover:bg-red-50'
                          }`}
                        >
                          All 7 days
                        </button>
                        {WEEKDAYS.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleCancelDay(d.value)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                              cancelDays.includes(d.value)
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cancelScope" checked={cancelScope === 'future'} onChange={() => setCancelScope('future')} />
                      All future shifts in this series
                    </label>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCancelOpen(false)} className="btn-secondary btn btn-sm">Back</button>
                <button
                  type="button"
                  disabled={deleteMut.isPending || (cancelScope === 'days' && cancelDays.length === 0)}
                  onClick={() => deleteMut.mutate({ scope: cancelScope, days: cancelScope === 'days' ? cancelDays : undefined })}
                  className="btn-danger btn btn-sm"
                >
                  {deleteMut.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          )}

          </fieldset>

          <div className="flex gap-3 pt-2">
            {!readOnly && shift && !cancelOpen && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                disabled={deleteMut.isPending}
                className="btn-danger btn-sm btn"
              >
                Cancel Shift
              </button>
            )}
            {!readOnly && shift && !shift.published && (() => {
              const assigned = (shift.userId ? 1 : 0) + (shift.coverCarers?.length ?? 0);
              const fullyAssigned = assigned >= (shift.cover || 1);
              return (
                <div className="flex flex-col items-start gap-1">
                  <button
                    type="button"
                    onClick={() => publishMut.mutate(shift.id)}
                    disabled={publishMut.isPending || !fullyAssigned}
                    title={fullyAssigned ? undefined : 'Assign a carer to every cover slot before publishing'}
                    className="btn-primary btn-sm btn"
                  >
                    {publishMut.isPending ? 'Publishing…' : '📣 Publish to Carer App'}
                  </button>
                  {!fullyAssigned && (
                    <span className="text-xs text-amber-600 font-medium">Assign all carers before publishing</span>
                  )}
                </div>
              );
            })()}
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="btn-secondary btn">Close</button>
            {!readOnly && !shift && (() => {
              const fullyAssigned = assignedIds.length >= cover;
              // A recurring repeat creates several draft shifts at once, but
              // publish only ever targets one shift id — so this shortcut is
              // only offered for a single, non-recurring visit.
              const isRecurring = repeatEnabled && repeatDays.length > 0;
              return (
                <button
                  type="button"
                  onClick={onSaveAndPublish}
                  disabled={isPending || isRecurring || !fullyAssigned}
                  title={isRecurring ? 'Publish each visit individually after creating' : fullyAssigned ? undefined : 'Assign a carer to every cover slot before publishing'}
                  className="btn-secondary btn"
                >
                  {isPending ? 'Saving…' : '📣 Create & Publish'}
                </button>
              );
            })()}
            {!readOnly && (
              <button
                type="submit"
                disabled={
                  isPending ||
                  (!shift && repeatEnabled && (repeatDays.length === 0 || (repeatEndType === 'date' && !repeatEndDate))) ||
                  (!!shift && ((assignScope === 'days' && assignDays.length === 0) || (assignScope === 'range' && (!assignFrom || !assignTo))))
                }
                className="btn-primary btn"
              >
                {isPending ? 'Saving…' : shift ? 'Save Changes' : repeatEnabled && repeatDays.length > 0 ? 'Create Visits' : 'Create Shift'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
  }

  // --- Manager editing an existing shift: two-pane layout (shift details + employee assignment) ---
  const patient = serviceUsers.find((su) => su.id === watch('serviceUserId'));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6 sm:my-0 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b shrink-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            ✎ {patient ? `${patient.firstName} ${patient.lastName}` : 'Edit Shift'}{watch('visitName') ? ` ${watch('visitName')}` : ''}
            {!shift.published && (
              <span className="text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Draft</span>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <form onSubmit={onSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* Left: shift details */}
            <div className="w-1/2 p-6 space-y-4 overflow-y-auto border-r">
              {error && (
                <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {error.response?.data?.error || 'An error occurred'}
                </div>
              )}

              <div>
                <label className="label">Service User (Patient) *</label>
                <select {...register('serviceUserId', { required: true })} value={watch('serviceUserId') ?? ''} className="input">
                  <option value="">Select a patient…</option>
                  {serviceUsers.map((su) => (
                    <option key={su.id} value={su.id}>
                      {su.firstName} {su.lastName}{su.postcode ? ` — ${su.postcode}` : ''}
                    </option>
                  ))}
                </select>
                {errors.serviceUserId && <p className="text-xs text-red-500 mt-1">Required</p>}
              </div>

              {renderVisitNamePicker(false)}

              <div className="flex items-center justify-between">
                <label className="label mb-0">Date & Time</label>
                <span className="text-xs text-gray-500">Duration: {durationLabel(watchedStart, watchedEnd)}</span>
              </div>
              <input type="date" {...register('date', { required: true })} className="input" />
              <div className="grid grid-cols-2 gap-3">
                <input type="time" {...register('startTime', { required: true })} className="input" />
                <input type="time" {...register('endTime', { required: true })} className="input" />
              </div>

              <div>
                <label className="label">Cover</label>
                <select {...register('cover', { valueAsNumber: true })} className="input">
                  <option value={1}>Single cover (1 carer)</option>
                  <option value={2}>Double cover (2 carers)</option>
                  <option value={3}>Triple cover (3 carers)</option>
                </select>
              </div>

              <div>
                <label className="label">Position / Role</label>
                <input {...register('role')} placeholder="e.g. Stockport Carer" className="input" />
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea {...register('notes')} rows={2} className="input resize-none" />
              </div>

              {runs.length > 0 && (
                <div>
                  <label className="label">Run</label>
                  <select value={runId} onChange={(e) => setRunId(e.target.value)} className="input">
                    <option value="">No run</option>
                    {runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}

              {!cancelOpen ? (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  disabled={deleteMut.isPending}
                  className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
                >
                  🗑 Delete Shift
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
                  <p className="text-sm font-medium text-red-800">Cancel this visit</p>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cancelScope" checked={cancelScope === 'one'} onChange={() => setCancelScope('one')} />
                      This shift only
                    </label>
                    {shift.seriesId && (
                      <>
                        <label className="flex items-center gap-2">
                          <input type="radio" name="cancelScope" checked={cancelScope === 'days'} onChange={() => setCancelScope('days')} />
                          Certain weekdays (this date onward)
                        </label>
                        {cancelScope === 'days' && (
                          <div className="flex flex-wrap gap-1.5 pl-6">
                            <button
                              type="button"
                              onClick={() => setCancelDays(cancelDays.length === ALL_DAYS.length ? [] : ALL_DAYS)}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                cancelDays.length === ALL_DAYS.length
                                  ? 'bg-red-700 text-white border-red-700'
                                  : 'bg-white text-red-700 border-red-400 hover:bg-red-50'
                              }`}
                            >
                              All 7 days
                            </button>
                            {WEEKDAYS.map((d) => (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() => toggleCancelDay(d.value)}
                                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                  cancelDays.includes(d.value)
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {d.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <label className="flex items-center gap-2">
                          <input type="radio" name="cancelScope" checked={cancelScope === 'future'} onChange={() => setCancelScope('future')} />
                          All future shifts in this series
                        </label>
                      </>
                    )}
                  </div>
                  <div className="rounded-md border border-red-200 bg-white p-2.5">
                    <CancelBillingFields value={cancelBilling} onChange={setCancelBilling} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCancelOpen(false)} className="btn-secondary btn btn-sm">Back</button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending || (cancelScope === 'days' && cancelDays.length === 0)}
                      onClick={() => deleteMut.mutate({ scope: cancelScope, days: cancelScope === 'days' ? cancelDays : undefined, ...toCancelBilling(cancelBilling) })}
                      className="btn-danger btn btn-sm"
                    >
                      {deleteMut.isPending ? 'Cancelling…' : cancelBilling.billable ? 'Confirm Cancel (chargeable)' : 'Confirm Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: employee assignment */}
            <div className="w-1/2 p-6 space-y-4 overflow-y-auto">
              <div>
                <h3 className="font-semibold text-gray-900">Carer Assignment</h3>
                <p className="text-xs text-gray-500">{assignedIds.length} of {cover} slot{cover > 1 ? 's' : ''} filled</p>
              </div>

              <input
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search by employee name"
                className="input"
              />

              {shift.seriesId && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 space-y-2 text-sm">
                  <p className="text-xs text-blue-800 font-medium">Recurring visit — apply changes to:</p>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="assignScope" checked={assignScope === 'one'} onChange={() => setAssignScope('one')} />
                    This shift only
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="assignScope" checked={assignScope === 'days'} onChange={() => setAssignScope('days')} />
                    Certain weekdays (this date onward)
                  </label>
                  {assignScope === 'days' && (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      <button
                        type="button"
                        onClick={() => setAssignDays(assignDays.length === ALL_DAYS.length ? [] : ALL_DAYS)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          assignDays.length === ALL_DAYS.length
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-blue-700 border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        All 7 days
                      </button>
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleAssignDay(d.value)}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            assignDays.includes(d.value)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="radio" name="assignScope" checked={assignScope === 'range'} onChange={() => setAssignScope('range')} />
                    Cover a date range (e.g. holiday cover)
                  </label>
                  {assignScope === 'range' && (
                    <div className="flex flex-wrap items-center gap-3 pl-6 text-xs text-gray-700">
                      <label className="flex items-center gap-1">From <input type="date" value={assignFrom} onChange={(e) => setAssignFrom(e.target.value)} className="input py-1 text-xs" /></label>
                      <label className="flex items-center gap-1">To <input type="date" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="input py-1 text-xs" /></label>
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="radio" name="assignScope" checked={assignScope === 'future'} onChange={() => setAssignScope('future')} />
                    All future shifts in this series
                  </label>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Who Is Working ({assignedUsers.length})
                </p>
                {assignedUsers.length === 0 ? (
                  <p className="text-sm text-gray-400">No one has been assigned to this shift yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {assignedUsers.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => removeCarer(u.id)}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <span className="text-sm text-gray-800">{u.firstName} {u.lastName}</span>
                      <StatusBadge active={u.active} />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Available ({availableUsers.length})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {availableUsers.map((u) => (
                    <label
                      key={u.id}
                      title={fullyAssigned ? 'All cover slots are filled' : 'Add to this shift'}
                      className={`flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 ${
                        fullyAssigned ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={fullyAssigned}
                        onChange={() => addCarer(u.id)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="text-sm text-gray-800">{u.firstName} {u.lastName}</span>
                      <StatusBadge active={u.active} />
                    </label>
                  ))}
                  {availableUsers.length === 0 && <p className="text-sm text-gray-400">No matching employees.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 border-t shrink-0">
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="btn-secondary btn">Cancel</button>
            {!shift.published && (
              <button
                type="button"
                onClick={onSaveAndPublish}
                disabled={isPending || !fullyAssigned || (assignScope === 'days' && assignDays.length === 0) || (assignScope === 'range' && (!assignFrom || !assignTo))}
                title={fullyAssigned ? undefined : 'Assign a carer to every cover slot before publishing'}
                className="btn-primary btn"
              >
                {isPending ? 'Saving…' : 'Update & Republish'}
              </button>
            )}
            <button
              type="submit"
              disabled={isPending || (assignScope === 'days' && assignDays.length === 0) || (assignScope === 'range' && (!assignFrom || !assignTo))}
              className="btn-primary btn"
            >
              {isPending ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
