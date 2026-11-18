import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInCalendarDays } from 'date-fns';
import {
  governanceApi,
  Audit,
  AuditInput,
  ImprovementAction,
  ActionInput,
  ActionStatus,
  AUDIT_TYPES,
  ACTION_SOURCES,
  PRIORITIES,
  auditTypeLabel,
  sourceLabel,
} from '../api/governance';
import { usersApi } from '../api/users';

// Audits and the service improvement plan (Reg 17).
//
// Two tabs, one loop: an audit finds something, the finding becomes an
// action, the action gets evidence. Both lists lead with what is overdue,
// because an improvement plan sorted by when things were created is a plan
// nobody works through.

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'That did not save. Please try again.';

const ACTION_STATUS_STYLE: Record<ActionStatus, string> = {
  OPEN: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

const PRIORITY_STYLE: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-gray-100 text-gray-600',
};

export default function Governance() {
  const [tab, setTab] = useState<'actions' | 'audits'>('actions');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Governance</h1>
        <p className="text-sm text-gray-500">
          Audits find things; the improvement plan is what you did about them. Regulation 17.
        </p>
      </div>

      <div className="flex gap-1.5 border-b border-gray-200">
        {([['actions', 'Improvement plan'], ['audits', 'Audits']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'actions' ? <ActionsTab /> : <AuditsTab />}
    </div>
  );
}

// --- Improvement plan ------------------------------------------------------

function ActionsTab() {
  const [filter, setFilter] = useState<'open' | 'all' | ActionStatus>('open');
  const [editing, setEditing] = useState<ImprovementAction | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['improvement-actions', filter],
    queryFn: () =>
      governanceApi.actions(filter === 'open' ? { open: true } : filter === 'all' ? {} : { status: filter }),
  });

  const overdue = actions.filter(
    (a) => a.dueDate && a.status !== 'DONE' && a.status !== 'CANCELLED' && new Date(a.dueDate) < new Date(),
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {([['open', 'Open'], ['IN_PROGRESS', 'In progress'], ['DONE', 'Done'], ['all', 'All']] as const).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <button className="btn-primary btn" onClick={() => setAdding(true)}>Add an action</button>
      </div>

      {overdue > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>{overdue}</strong> action{overdue === 1 ? ' is' : 's are'} past the due date.
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" />
          </div>
        ) : actions.length === 0 ? (
          <p className="text-sm text-gray-400 p-2">
            Nothing here. Actions can come from an audit, a complaint, a safeguarding concern, an incident —
            or from somebody simply noticing something.
          </p>
        ) : (
          <div className="divide-y">
            {actions.map((a) => {
              const days = a.dueDate ? differenceInCalendarDays(new Date(a.dueDate), new Date()) : null;
              const late = days !== null && days < 0 && a.status !== 'DONE' && a.status !== 'CANCELLED';
              return (
                <button
                  key={a.id}
                  onClick={() => setEditing(a)}
                  className="w-full text-left flex flex-wrap items-start justify-between gap-3 py-2.5 hover:bg-gray-50 px-1 -mx-1 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{a.title}</p>
                    <p className="text-xs text-gray-500">
                      {sourceLabel(a.source)}
                      {a.audit && <> · {auditTypeLabel(a.audit.type)} audit</>}
                      {a.owner && <> · {a.owner.firstName} {a.owner.lastName}</>}
                      {a.dueDate && (
                        <span className={late ? 'text-red-600 font-medium' : ''}>
                          {' '}· due {fmt(a.dueDate)}{late ? ` (${Math.abs(days!)} days late)` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`badge ${PRIORITY_STYLE[a.priority] || ''}`}>{a.priority.toLowerCase()}</span>
                    <span className={`badge ${ACTION_STATUS_STYLE[a.status]}`}>
                      {a.status === 'IN_PROGRESS' ? 'in progress' : a.status.toLowerCase()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(adding || editing) && (
        <ActionModal action={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
}

function ActionModal({ action, onClose }: { action: ImprovementAction | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !action;
  const [draft, setDraft] = useState<ActionInput>({ priority: 'MEDIUM', source: 'OTHER' });
  const set = <K extends keyof ActionInput>(k: K, v: ActionInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof ActionInput>(k: K, fallback: ActionInput[K]): ActionInput[K] =>
    k in draft ? draft[k] : fallback;

  const { data: staff = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });
  const { data: audits = [] } = useQuery({
    queryKey: ['audits', 'all'],
    queryFn: () => governanceApi.audits(),
  });

  const save = useMutation({
    mutationFn: (patch: ActionInput) =>
      isNew ? governanceApi.createAction(patch) : governanceApi.updateAction(action!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['improvement-actions'] });
      qc.invalidateQueries({ queryKey: ['audits'] });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => governanceApi.removeAction(action!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['improvement-actions'] });
      onClose();
    },
  });

  return (
    <Modal title={isNew ? 'Add an action' : action!.title} onClose={onClose}>
      <div className="space-y-4">
        <Labelled label="What needs doing">
          <input
            className="input"
            value={(val('title', action?.title) ?? '') as string}
            onChange={(e) => set('title', e.target.value)}
          />
        </Labelled>

        <Labelled label="Detail">
          <textarea
            className="input"
            rows={3}
            value={(val('detail', action?.detail) ?? '') as string}
            onChange={(e) => set('detail', e.target.value)}
          />
        </Labelled>

        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label="Where it came from">
            <select
              className="input"
              value={(val('source', action?.source) ?? 'OTHER') as string}
              onChange={(e) => set('source', e.target.value)}
            >
              {ACTION_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Labelled>
          <Labelled label="Which audit" hint="Optional. Links it back to the finding.">
            <select
              className="input"
              value={(val('auditId', action?.auditId) ?? '') as string}
              onChange={(e) => set('auditId', e.target.value || null)}
            >
              <option value="">—</option>
              {audits.map((a) => (
                <option key={a.id} value={a.id}>
                  {auditTypeLabel(a.type)} · {fmt(a.auditedAt)}
                </option>
              ))}
            </select>
          </Labelled>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Labelled label="Owner">
            <select
              className="input"
              value={(val('ownerId', action?.owner?.id) ?? '') as string}
              onChange={(e) => set('ownerId', e.target.value || null)}
            >
              <option value="">—</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </Labelled>
          <Labelled label="Due by">
            <input
              type="date"
              className="input"
              value={((val('dueDate', action?.dueDate) as string | null) || '').slice(0, 10)}
              onChange={(e) => set('dueDate', e.target.value || null)}
            />
          </Labelled>
          <Labelled label="Priority">
            <select
              className="input"
              value={(val('priority', action?.priority) ?? 'MEDIUM') as string}
              onChange={(e) => set('priority', e.target.value)}
            >
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Labelled>
        </div>

        {!isNew && (
          <>
            <Labelled
              label="What shows it was done"
              hint="Required to close it. An action marked done with nothing behind it is what an inspector is testing for."
            >
              <textarea
                className="input"
                rows={3}
                value={(val('evidence', action?.evidence) ?? '') as string}
                onChange={(e) => set('evidence', e.target.value)}
              />
            </Labelled>

            <Labelled label="Status">
              <select
                className="input"
                value={(val('status', action?.status) ?? 'OPEN') as string}
                onChange={(e) => set('status', e.target.value as ActionStatus)}
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="DONE">Done</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </Labelled>

            {action!.completedAt && (
              <p className="text-sm text-green-700 font-medium">
                Closed {fmt(action!.completedAt)}
                {action!.completedBy ? ` by ${action!.completedBy.firstName} ${action!.completedBy.lastName}` : ''}.
              </p>
            )}
          </>
        )}

        {(save.isError || remove.isError) && (
          <p className="text-sm text-red-600">{err(save.error || remove.error)}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!isNew && action!.status !== 'DONE' && (
            <button
              className="text-sm text-gray-400 hover:text-red-600"
              onClick={() => { if (window.confirm('Delete this action?')) remove.mutate(); }}
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary btn"
            disabled={save.isPending || (isNew && !draft.title?.trim())}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'Saving…' : isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- Audits ----------------------------------------------------------------

function AuditsTab() {
  const [editing, setEditing] = useState<Audit | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['audits', 'list'],
    queryFn: () => governanceApi.audits(),
  });

  // The schedule: what is due, and what has no next date at all. The second
  // is the quieter failure — an audit that happened once.
  const { due, unscheduled } = useMemo(() => {
    const latest = new Map<string, Audit>();
    for (const a of audits) if (!latest.has(a.type)) latest.set(a.type, a);
    const rows = [...latest.values()];
    return {
      due: rows.filter((a) => a.nextDueDate && new Date(a.nextDueDate) < new Date()),
      unscheduled: rows.filter((a) => !a.nextDueDate),
    };
  }, [audits]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary btn" onClick={() => setAdding(true)}>Record an audit</button>
      </div>

      {(due.length > 0 || unscheduled.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {due.length > 0 && <><strong>{due.length}</strong> audit{due.length === 1 ? '' : 's'} due</>}
          {due.length > 0 && unscheduled.length > 0 && ' · '}
          {unscheduled.length > 0 && (
            <><strong>{unscheduled.length}</strong> with no next date set</>
          )}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" />
          </div>
        ) : audits.length === 0 ? (
          <p className="text-sm text-gray-400 p-2">
            No audits recorded. Reg 17 asks for regular checks on care plans, MAR charts, daily notes,
            recruitment files and call monitoring — and for what you did about what they found.
          </p>
        ) : (
          <div className="divide-y">
            {audits.map((a) => {
              const overdue = !!a.nextDueDate && new Date(a.nextDueDate) < new Date();
              return (
                <button
                  key={a.id}
                  onClick={() => setEditing(a)}
                  className="w-full text-left flex flex-wrap items-start justify-between gap-3 py-2.5 hover:bg-gray-50 px-1 -mx-1 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {a.title || auditTypeLabel(a.type)}
                      {a.title && <span className="text-gray-400 font-normal"> · {auditTypeLabel(a.type)}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmt(a.auditedAt)}
                      {a.auditedBy && <> · {a.auditedBy.firstName} {a.auditedBy.lastName}</>}
                      {a.scope && <> · {a.scope}</>}
                      {a.nextDueDate && (
                        <span className={overdue ? 'text-red-600 font-medium' : ''}>
                          {' '}· next {overdue ? 'overdue' : 'due'} {fmt(a.nextDueDate)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.score !== null && a.maxScore !== null && (
                      <span className="badge bg-gray-100 text-gray-700">{a.score}/{a.maxScore}</span>
                    )}
                    {a._count.actions > 0 && (
                      <span className="badge bg-blue-100 text-blue-700">{a._count.actions} action{a._count.actions === 1 ? '' : 's'}</span>
                    )}
                    <span className={`badge ${a.status === 'COMPLETE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {a.status.toLowerCase()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(adding || editing) && (
        <AuditModal audit={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
}

function AuditModal({ audit, onClose }: { audit: Audit | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !audit;
  const [draft, setDraft] = useState<AuditInput>({ type: 'CARE_PLAN' });
  const set = <K extends keyof AuditInput>(k: K, v: AuditInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof AuditInput>(k: K, fallback: AuditInput[K]): AuditInput[K] =>
    k in draft ? draft[k] : fallback;

  const { data: detail } = useQuery({
    queryKey: ['audit', audit?.id],
    queryFn: () => governanceApi.audit(audit!.id),
    enabled: !!audit,
  });

  const save = useMutation({
    mutationFn: (patch: AuditInput) =>
      isNew ? governanceApi.createAudit(patch) : governanceApi.updateAudit(audit!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audits'] });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => governanceApi.removeAudit(audit!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audits'] });
      onClose();
    },
  });

  return (
    <Modal title={isNew ? 'Record an audit' : audit!.title || auditTypeLabel(audit!.type)} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label="What was audited">
            <select
              className="input"
              value={(val('type', audit?.type) ?? 'CARE_PLAN') as string}
              onChange={(e) => set('type', e.target.value)}
            >
              {AUDIT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Labelled>
          <Labelled label="Carried out on">
            <input
              type="date"
              className="input"
              value={((val('auditedAt', audit?.auditedAt) as string | null) || '').slice(0, 10)}
              onChange={(e) => set('auditedAt', e.target.value || null)}
            />
          </Labelled>
        </div>

        <Labelled label="What was looked at" hint="“Six care plans across two sites” — the line that makes this checkable later.">
          <input
            className="input"
            value={(val('scope', audit?.scope) ?? '') as string}
            onChange={(e) => set('scope', e.target.value)}
          />
        </Labelled>

        <div className="grid sm:grid-cols-3 gap-3">
          <Labelled label="Score">
            <input
              type="number"
              className="input"
              value={(val('score', audit?.score) ?? '') as number | string}
              onChange={(e) => set('score', e.target.value ? Number(e.target.value) : null)}
            />
          </Labelled>
          <Labelled label="Out of">
            <input
              type="number"
              className="input"
              value={(val('maxScore', audit?.maxScore) ?? '') as number | string}
              onChange={(e) => set('maxScore', e.target.value ? Number(e.target.value) : null)}
            />
          </Labelled>
          <Labelled label="Next due">
            <input
              type="date"
              className="input"
              value={((val('nextDueDate', audit?.nextDueDate) as string | null) || '').slice(0, 10)}
              onChange={(e) => set('nextDueDate', e.target.value || null)}
            />
          </Labelled>
        </div>

        <Labelled label="What it found" hint="Required before marking it complete. “Nothing of concern” is a finding worth writing down.">
          <textarea
            className="input"
            rows={5}
            value={(val('findings', audit?.findings) ?? '') as string}
            onChange={(e) => set('findings', e.target.value)}
          />
        </Labelled>

        {!isNew && (
          <Labelled label="Status">
            <select
              className="input"
              value={(val('status', audit?.status) ?? 'OPEN') as string}
              onChange={(e) => set('status', e.target.value as 'OPEN' | 'COMPLETE')}
            >
              <option value="OPEN">Open</option>
              <option value="COMPLETE">Complete</option>
            </select>
          </Labelled>
        )}

        {detail && detail.actions.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">
              Actions from this audit
            </p>
            <div className="space-y-1">
              {detail.actions.map((a) => (
                <p key={a.id} className="text-sm text-gray-700">
                  <span className={`badge mr-1.5 ${ACTION_STATUS_STYLE[a.status]}`}>
                    {a.status === 'IN_PROGRESS' ? 'in progress' : a.status.toLowerCase()}
                  </span>
                  {a.title}
                </p>
              ))}
            </div>
          </div>
        )}

        {(save.isError || remove.isError) && (
          <p className="text-sm text-red-600">{err(save.error || remove.error)}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!isNew && (
            <button
              className="text-sm text-gray-400 hover:text-red-600"
              onClick={() => { if (window.confirm('Delete this audit?')) remove.mutate(); }}
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn" disabled={save.isPending} onClick={() => save.mutate(draft)}>
            {save.isPending ? 'Saving…' : isNew ? 'Record it' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- Shared ----------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6 sm:my-0 max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
