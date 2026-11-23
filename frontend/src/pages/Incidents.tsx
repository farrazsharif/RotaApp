import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { incidentsApi, IncidentSummary, IncidentPatch } from '../api/incidents';
import {
  INCIDENT_INVESTIGATION,
  INCIDENT_QUESTION_COUNT,
  INCIDENT_CONCLUSION_KEY,
  IncidentAnswer,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  answeredCount,
} from '../lib/incidentForm';
import AutoGrowTextarea from '../components/AutoGrowTextarea';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../contexts/AuthContext';

// Accidents, incidents and near misses.
//
// The list leads on what is still open, because an incident nobody closed is
// the thing that gets found at inspection. Opening one shows the carer's
// report as they wrote it — never edited silently — above Care 24's own
// Accident & Incident Form for the office to work through.

const FILTERS = [
  { v: 'OPEN', label: 'Open' },
  { v: 'REPORTED', label: 'Reported' },
  { v: 'INVESTIGATING', label: 'Investigating' },
  { v: 'CLOSED', label: 'Closed' },
  { v: '', label: 'All' },
];

// Reg 20's harm levels. Candour is engaged from moderate upwards.
const HARM_LEVELS = [
  { v: 'NONE', label: 'No harm' },
  { v: 'LOW', label: 'Low' },
  { v: 'MODERATE', label: 'Moderate' },
  { v: 'SEVERE', label: 'Severe' },
  { v: 'DEATH', label: 'Death' },
  { v: 'PSYCHOLOGICAL', label: 'Prolonged psychological' },
];

export default function Incidents() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can('manage_service_users');
  // Deleting is admin-only, matching requireRole(Role.ADMIN) on the route. An
  // incident report is evidence: a manager investigates one, only an account
  // holder removes one, and only because it should never have been filed.
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState('OPEN');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => incidentsApi.list(),
  });

  const shown = useMemo(() => {
    if (filter === 'OPEN') return rows.filter((r) => r.status !== 'CLOSED');
    if (!filter) return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const openCount = rows.filter((r) => r.status !== 'CLOSED').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Accidents &amp; Incidents</h1>
          <p className="text-sm text-gray-500">
            {openCount === 0 ? 'Nothing open.' : `${openCount} still open.`} Reports come in from carers; the investigation is
            completed here.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                filter === f.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

      {!isLoading && shown.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">{filter === 'OPEN' ? 'No open incidents.' : 'Nothing to show.'}</p>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((r) => (
          <IncidentRow key={r.id} row={r} onOpen={() => setOpenId(r.id)} />
        ))}
      </div>

      {openId && (
        <IncidentDetail
          id={openId}
          canManage={canManage}
          canDelete={isAdmin}
          onClose={() => setOpenId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['incidents'] })}
        />
      )}
    </div>
  );
}

function IncidentRow({ row, onOpen }: { row: IncidentSummary; onOpen: () => void }) {
  const who = row.serviceUser ? `${row.serviceUser.firstName} ${row.serviceUser.lastName}` : 'No client';
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[row.status] || 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABEL[row.status] || row.status}
        </span>
        <span className="text-xs font-semibold text-gray-700">{KIND_LABEL[row.kind] || row.kind}</span>
        {row.category && <span className="text-xs text-gray-500">· {row.category}</span>}
        {row.emergencyServices && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">999 called</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{format(new Date(row.occurredAt), 'EEE d MMM yyyy, HH:mm')}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900 mt-1">{who}</p>
      <p className="text-sm text-gray-600 line-clamp-2">{row.whatHappened}</p>
      {row.reportedBy && (
        <p className="text-xs text-gray-400 mt-0.5">
          Reported by {row.reportedBy.firstName} {row.reportedBy.lastName}
        </p>
      )}
    </button>
  );
}

function IncidentDetail({
  id,
  canManage,
  canDelete,
  onClose,
  onChanged,
}: {
  id: string;
  canManage: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: inc, isLoading } = useQuery({ queryKey: ['incident', id], queryFn: () => incidentsApi.get(id) });

  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);
  // Edited since the last write. This form is twenty-one questions long and
  // somebody filling it in will go and look at the rota half way through;
  // losing it at that point means typing the whole thing again.
  const [dirty, setDirty] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);

  // Duty of candour lives in real columns rather than the investigation blob,
  // because the dashboard has to be able to ask which incidents are still
  // waiting on it. So it gets its own draft, merged into the same save.
  const [candour, setCandour] = useState<IncidentPatch>({});
  const setC = <K extends keyof IncidentPatch>(key: K, val: IncidentPatch[K]) => {
    setSaved(false);
    setDirty(true);
    setCandour((c) => ({ ...c, [key]: val }));
  };
  const cv = <K extends keyof IncidentPatch>(key: K, fallback: IncidentPatch[K]): IncidentPatch[K] =>
    key in candour ? candour[key] : fallback;

  // Load the stored answers once the record arrives, and not on every render.
  const stored = useMemo(() => {
    if (!inc) return {};
    try {
      return JSON.parse(inc.investigation || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [inc]);
  const v = values ?? stored;

  const set = (key: string, val: unknown) => {
    setSaved(false);
    setDirty(true);
    setValues({ ...v, [key]: val });
  };
  const answer = (key: string): IncidentAnswer => (v[key] as IncidentAnswer) || { v: '', notes: '' };

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof incidentsApi.update>[1]) => incidentsApi.update(id, patch),
    onSuccess: () => {
      setSaved(true);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['incident', id] });
      onChanged();
    },
  });

  // A draft write: the same patch Save sends, minus the closing. It moves a
  // REPORTED incident to INVESTIGATING exactly as Save does, because somebody
  // typing into the investigation IS investigating, and having the two paths
  // disagree would be the surprise.
  const editable = canManage && !!inc && inc.status !== 'CLOSED';
  const draftPatch = (): IncidentPatch => ({
    ...candour,
    investigation: v,
    status: inc?.status === 'REPORTED' ? 'INVESTIGATING' : undefined,
  });

  // Deleting a report filed in error. Two steps on purpose: the button arms,
  // then confirms, and the confirm names what goes. An autosave is in flight
  // every 1.2 seconds on this form, so the record is closed out of the list
  // the moment it is gone rather than left for the next invalidate to notice.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleted = useRef(false);
  const remove = useMutation({
    mutationFn: () => incidentsApi.remove(id),
    onSuccess: () => {
      deleted.current = true;
      setDirty(false);
      qc.removeQueries({ queryKey: ['incident', id] });
      onChanged();
      onClose();
    },
  });

  const autosave = useMutation({
    mutationFn: (patch: IncidentPatch) => incidentsApi.update(id, patch),
    onSuccess: () => {
      setAutoSavedAt(new Date());
      setDirty(false);
      onChanged();
    },
  });

  // Typing resets the timer, so the write happens in the pause after a
  // thought rather than on every keystroke.
  useEffect(() => {
    if (!dirty || !editable) return;
    const t = setTimeout(() => autosave.mutate(draftPatch()), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, values, candour, editable]);

  // The case the debounce cannot cover: the modal going away inside that
  // pause, whether by the Close button or by navigating to the rota. Sent
  // straight through the API rather than the mutation, because the component
  // is already unmounting and a mutation tied to it would not fire.
  const unsaved = useRef<{ dirty: boolean; editable: boolean; patch: IncidentPatch }>({
    dirty: false,
    editable: false,
    patch: {},
  });
  // Updated after each render rather than during one: a ref written while
  // rendering is a side effect in the render pass, and React is explicit that
  // it should not happen.
  useEffect(() => {
    unsaved.current = { dirty, editable, patch: draftPatch() };
  });
  useEffect(
    () => () => {
      const u = unsaved.current;
      if (deleted.current) return;
      if (u.dirty && u.editable) incidentsApi.update(id, u.patch).catch(() => { /* nothing left to tell */ });
    },
    [id],
  );

  const done = answeredCount(v);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6 sm:my-0 max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {inc ? KIND_LABEL[inc.kind] || inc.kind : 'Incident'}
              {inc?.serviceUser ? ` — ${inc.serviceUser.firstName} ${inc.serviceUser.lastName}` : ''}
            </h2>
            {inc && (
              <p className="text-xs text-gray-500">
                {format(new Date(inc.occurredAt), 'EEEE d MMMM yyyy, HH:mm')}
                {inc.reportedBy ? ` · reported by ${inc.reportedBy.firstName} ${inc.reportedBy.lastName}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

          {inc && (
            <>
              {/* The carer's own words. Read-only here on purpose: a contemporaneous
                  account is worth more than a tidied one, and an inspector will ask
                  who changed it. */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">The report</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[inc.status]}`}>
                    {STATUS_LABEL[inc.status]}
                  </span>
                </div>
                <Field label="What happened" value={inc.whatHappened} />
                <Field label="Injuries" value={inc.injuries} />
                <Field label="Action taken straight away" value={inc.immediateAction} />
                <Field label="Who was told" value={inc.whoInformed} />
                <Field label="Others present" value={inc.witnesses} />
                {inc.emergencyServices && <p className="text-sm font-semibold text-red-700">Emergency services were called.</p>}
              </div>

              {/* Care 24's Accident & Incident Form */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Accident &amp; Incident Form</p>
                  <span className="text-xs text-gray-400">{done} of {INCIDENT_QUESTION_COUNT} answered</span>
                </div>

                <div className="space-y-4">
                  {INCIDENT_INVESTIGATION.map((g) => (
                    <div key={g.id} className="rounded-xl border border-gray-200">
                      <p className="text-sm font-semibold text-gray-800 bg-gray-50 px-3 py-2 rounded-t-xl">{g.title}</p>
                      <div className="divide-y divide-gray-100">
                        {g.questions.map((q) => {
                          const a = answer(q.key);
                          return (
                            <div key={q.key} className="p-3">
                              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                                <span className="text-sm text-gray-800 flex-1 min-w-[220px]">{q.label}</span>
                                <div className="flex gap-1 shrink-0">
                                  {(['YES', 'NO', 'NA'] as const).map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      disabled={!canManage}
                                      onClick={() => set(q.key, { ...a, v: a.v === opt ? '' : opt })}
                                      className={`px-2.5 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
                                        a.v === opt
                                          ? opt === 'YES'
                                            ? 'bg-green-600 text-white border-green-600'
                                            : opt === 'NO'
                                            ? 'bg-red-600 text-white border-red-600'
                                            : 'bg-gray-500 text-white border-gray-500'
                                          : 'bg-white text-gray-600 border-gray-300'
                                      }`}
                                    >
                                      {opt === 'NA' ? 'N/A' : opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <AutoGrowTextarea
                                value={a.notes}
                                minRows={1}
                                disabled={!canManage}
                                placeholder="Notes"
                                onChange={(e) => set(q.key, { ...a, notes: e.target.value })}
                                className="input text-sm mt-1.5"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-800 mb-1.5">Conclusion</p>
                    <AutoGrowTextarea
                      value={(v[INCIDENT_CONCLUSION_KEY] as string) || ''}
                      minRows={3}
                      disabled={!canManage}
                      onChange={(e) => set(INCIDENT_CONCLUSION_KEY, e.target.value)}
                      className="input text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Duty of candour (Reg 20) and RIDDOR. Shown for every incident
                  rather than only the harmful ones: the decision that candour
                  does NOT apply is itself a record an inspector asks to see. */}
              <div className="rounded-xl border border-gray-200">
                <div className="bg-gray-50 px-3 py-2 rounded-t-xl">
                  <p className="text-sm font-semibold text-gray-800">Duty of candour</p>
                  <p className="text-xs text-gray-500">
                    Regulation 20. Engaged from moderate harm upwards: tell the person face to face, apologise,
                    then follow up in writing.
                  </p>
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Level of harm</p>
                    <div className="flex flex-wrap gap-1">
                      {HARM_LEVELS.map((h) => {
                        const on = cv('candourHarm', inc.candourHarm) === h.v;
                        return (
                          <button
                            key={h.v}
                            type="button"
                            disabled={!canManage}
                            onClick={() => setC('candourHarm', on ? null : h.v)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
                              on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'
                            }`}
                          >
                            {h.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <TriState
                    label="Does duty of candour apply?"
                    value={cv('candourRequired', inc.candourRequired) ?? null}
                    disabled={!canManage}
                    onChange={(val) => setC('candourRequired', val)}
                  />

                  {cv('candourRequired', inc.candourRequired) === true && (
                    <div className="space-y-3 border-l-2 border-amber-300 pl-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <DateField
                          label="Told in person on"
                          value={cv('candourToldAt', inc.candourToldAt) ?? null}
                          disabled={!canManage}
                          onChange={(val) => setC('candourToldAt', val)}
                        />
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Who was told</p>
                          <input
                            className="input text-sm"
                            disabled={!canManage}
                            placeholder="Name and relationship"
                            value={(cv('candourToldWho', inc.candourToldWho) ?? '') as string}
                            onChange={(e) => setC('candourToldWho', e.target.value)}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          disabled={!canManage}
                          checked={(cv('candourApology', inc.candourApology) ?? false) as boolean}
                          onChange={(e) => setC('candourApology', e.target.checked)}
                        />
                        An apology was given
                      </label>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <DateField
                          label="Written follow-up sent"
                          value={cv('candourWrittenAt', inc.candourWrittenAt) ?? null}
                          disabled={!canManage}
                          onChange={(val) => setC('candourWrittenAt', val)}
                        />
                        <DateField
                          label="Findings shared"
                          value={cv('candourOutcomeAt', inc.candourOutcomeAt) ?? null}
                          disabled={!canManage}
                          onChange={(val) => setC('candourOutcomeAt', val)}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Notes</p>
                    <AutoGrowTextarea
                      value={(cv('candourNotes', inc.candourNotes) ?? '') as string}
                      minRows={2}
                      disabled={!canManage}
                      placeholder="What was said, and by whom. If the person could not be reached or did not want to be told, record that here — it still discharges the duty."
                      onChange={(e) => setC('candourNotes', e.target.value)}
                      className="input text-sm"
                    />
                  </div>

                  <div className="border-t pt-3 space-y-3">
                    <TriState
                      label="Is this reportable under RIDDOR?"
                      value={cv('riddorRequired', inc.riddorRequired) ?? null}
                      disabled={!canManage}
                      onChange={(val) => setC('riddorRequired', val)}
                    />
                    {cv('riddorRequired', inc.riddorRequired) === true && (
                      <div className="grid sm:grid-cols-2 gap-3 border-l-2 border-amber-300 pl-3">
                        <DateField
                          label="Reported on"
                          value={cv('riddorReportedAt', inc.riddorReportedAt) ?? null}
                          disabled={!canManage}
                          onChange={(val) => setC('riddorReportedAt', val)}
                        />
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">HSE reference</p>
                          <input
                            className="input text-sm"
                            disabled={!canManage}
                            value={(cv('riddorRef', inc.riddorRef) ?? '') as string}
                            onChange={(e) => setC('riddorRef', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {inc.status === 'CLOSED' && inc.closedAt && (
                <p className="text-sm text-green-700 font-medium">
                  Closed {format(new Date(inc.closedAt), 'd MMM yyyy')}
                  {inc.closedBy ? ` by ${inc.closedBy.firstName} ${inc.closedBy.lastName}` : ''}.
                </p>
              )}
            </>
          )}
        </div>

        {canManage && inc && (
          <div className="flex flex-wrap items-center gap-2 p-4 border-t shrink-0">
            {saved ? (
              <span className="text-sm text-green-600">Saved ✓</span>
            ) : autosave.isPending ? (
              <span className="text-sm text-gray-400">Saving…</span>
            ) : dirty ? (
              <span className="text-sm text-gray-400">Unsaved changes</span>
            ) : autoSavedAt ? (
              <span className="text-sm text-gray-500">Draft saved {format(autoSavedAt, 'HH:mm')}</span>
            ) : null}
            {autosave.isError && (
              <span className="text-sm text-amber-700">Could not save the draft — use Save before leaving.</span>
            )}
            {save.isError && (
              <span className="text-sm text-red-600 font-medium">
                {(save.error as { response?: { data?: { error?: string } } })?.response?.data?.error
                  || 'That did not save. Please try again.'}
              </span>
            )}
            {canDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-700">Delete this report for good?</span>
                  <button
                    className="btn-secondary btn text-red-700 border-red-300"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    {remove.isPending ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button className="btn-secondary btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              ) : (
                <button
                  className="btn-secondary btn text-red-700"
                  onClick={() => setConfirmDelete(true)}
                  title="For a report filed in error. This cannot be undone."
                >
                  Delete report
                </button>
              )
            )}
            {remove.error != null && (
              <span className="text-xs text-red-600">
                {(remove.error as { response?: { data?: { error?: string } } })?.response?.data?.error
                  || 'That did not delete. Please try again.'}
              </span>
            )}
            <div className="flex-1" />
            <button className="btn-secondary btn" onClick={onClose}>Close</button>
            <button
              className="btn-secondary btn"
              disabled={save.isPending}
              onClick={() => save.mutate({ ...candour, investigation: v, status: inc.status === 'REPORTED' ? 'INVESTIGATING' : undefined })}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {inc.status !== 'CLOSED' ? (
              <button
                className="btn-primary btn"
                disabled={save.isPending}
                onClick={() => save.mutate({ ...candour, investigation: v, status: 'CLOSED' })}
              >
                Save &amp; close incident
              </button>
            ) : (
              <button
                className="btn-secondary btn"
                disabled={save.isPending}
                onClick={() => save.mutate({ status: 'INVESTIGATING' })}
              >
                Reopen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Yes / No / not yet decided. The third state is the point: an unanswered
// question is what the dashboard chases, and a plain checkbox cannot say it.
function TriState({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean | null;
  disabled?: boolean;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm text-gray-800 flex-1 min-w-[200px]">{label}</span>
      <div className="flex gap-1 shrink-0">
        {([true, false] as const).map((opt) => (
          <button
            key={String(opt)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === opt ? null : opt)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
              value === opt
                ? opt
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-gray-500 text-white border-gray-500'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {opt ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
      {value === null && <span className="text-xs text-gray-400">Not yet decided</span>}
    </div>
  );
}

// A date the office can set or clear. Sends an ISO date or null, which is what
// the server distinguishes from a typo.
function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled?: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      <input
        type="date"
        className="input text-sm"
        disabled={disabled}
        value={value ? value.slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
