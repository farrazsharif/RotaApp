import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { incidentsApi, IncidentSummary } from '../api/incidents';
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

export default function Incidents() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can('manage_service_users');
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
  onClose,
  onChanged,
}: {
  id: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: inc, isLoading } = useQuery({ queryKey: ['incident', id], queryFn: () => incidentsApi.get(id) });

  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

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
    setValues({ ...v, [key]: val });
  };
  const answer = (key: string): IncidentAnswer => (v[key] as IncidentAnswer) || { v: '', notes: '' };

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof incidentsApi.update>[1]) => incidentsApi.update(id, patch),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['incident', id] });
      onChanged();
    },
  });

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
            {saved && <span className="text-sm text-green-600">Saved ✓</span>}
            <div className="flex-1" />
            <button className="btn-secondary btn" onClick={onClose}>Close</button>
            <button
              className="btn-secondary btn"
              disabled={save.isPending}
              onClick={() => save.mutate({ investigation: v, status: inc.status === 'REPORTED' ? 'INVESTIGATING' : undefined })}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {inc.status !== 'CLOSED' ? (
              <button
                className="btn-primary btn"
                disabled={save.isPending}
                onClick={() => save.mutate({ investigation: v, status: 'CLOSED' })}
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

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
