import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  safeguardingApi,
  ConcernSummary,
  ConcernStatus,
  ConcernDraft,
  ConcernPatch,
  HARM_TYPES,
  SOURCES,
  parseHarm,
  harmLabel,
  sourceLabel,
} from '../api/safeguarding';
import { serviceUsersApi } from '../api/serviceUsers';
import { usersApi } from '../api/users';

// The safeguarding log (Reg 13).
//
// The shape of this screen follows the question an inspector asks, which is
// never "do you have a log" but "show me one and walk me through it": what was
// raised, what was done that day, whether it went to the local authority and
// with what reference, whether CQC was told, and what changed afterwards.

const STATUS_STYLE: Record<ConcernStatus, string> = {
  OPEN: 'bg-red-100 text-red-800',
  INVESTIGATING: 'bg-amber-100 text-amber-800',
  REFERRED: 'bg-blue-100 text-blue-800',
  CLOSED: 'bg-green-100 text-green-800',
};

const STATUS_LABEL: Record<ConcernStatus, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  REFERRED: 'Referred',
  CLOSED: 'Closed',
};

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');

const personOf = (c: ConcernSummary) =>
  c.serviceUser ? `${c.serviceUser.firstName} ${c.serviceUser.lastName}` : c.personAtRisk || 'Not named';

function HarmChips({ json }: { json: string }) {
  const keys = parseHarm(json);
  if (!keys.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="badge bg-gray-100 text-gray-700 text-xs">{harmLabel(k)}</span>
      ))}
    </span>
  );
}

export default function Safeguarding() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'all' | ConcernStatus>('open');
  const [raising, setRaising] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: concerns = [], isLoading } = useQuery({
    queryKey: ['safeguarding', filter],
    queryFn: () =>
      safeguardingApi.list(
        filter === 'open' ? { open: true } : filter === 'all' ? {} : { status: filter },
      ),
  });

  const counts = useMemo(() => {
    const open = concerns.filter((c) => c.status !== 'CLOSED').length;
    const unreferred = concerns.filter((c) => c.status !== 'CLOSED' && !c.referredToLA).length;
    return { open, unreferred };
  }, [concerns]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Safeguarding</h1>
          <p className="text-sm text-gray-500">
            Concerns raised, referrals made, and what was learned. Regulation 13.
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setRaising(true)}>Raise a concern</button>
      </div>

      {counts.open > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>{counts.open}</strong> concern{counts.open === 1 ? '' : 's'} still open
          {counts.unreferred > 0 && <> · {counts.unreferred} not yet referred to the local authority</>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {([
          ['open', 'Open'],
          ['INVESTIGATING', 'Investigating'],
          ['REFERRED', 'Referred'],
          ['CLOSED', 'Closed'],
          ['all', 'All'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center p-8"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
        ) : concerns.length === 0 ? (
          <p className="text-sm text-gray-400 p-2">
            {filter === 'open' ? 'No open concerns.' : 'Nothing recorded here yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="text-left p-2.5 font-medium">Raised</th>
                  <th className="text-left p-2.5 font-medium">Person at risk</th>
                  <th className="text-left p-2.5 font-medium">Type</th>
                  <th className="text-left p-2.5 font-medium">Raised by</th>
                  <th className="text-left p-2.5 font-medium">Referral</th>
                  <th className="text-left p-2.5 font-medium">Status</th>
                  <th className="p-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {concerns.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="p-2.5 whitespace-nowrap text-gray-600">{fmt(c.raisedAt)}</td>
                    <td className="p-2.5">
                      <p className="font-medium text-gray-900">{personOf(c)}</p>
                      {c.staffInvolved && (
                        <p className="text-xs text-red-700">
                          Concerns {c.staffInvolved.firstName} {c.staffInvolved.lastName}
                        </p>
                      )}
                    </td>
                    <td className="p-2.5"><HarmChips json={c.harmTypes} /></td>
                    <td className="p-2.5 text-gray-600 whitespace-nowrap">
                      {sourceLabel(c.source)}
                      {c.raisedByName && <span className="block text-xs text-gray-400">{c.raisedByName}</span>}
                    </td>
                    <td className="p-2.5 text-xs whitespace-nowrap">
                      {c.referredToLA ? (
                        <span className="text-gray-700">LA {c.laReference || <span className="text-amber-700">no ref</span>}</span>
                      ) : (
                        <span className="text-gray-400">Not referred</span>
                      )}
                      {c.cqcNotified && <span className="block text-gray-500">CQC notified</span>}
                      {c.policeInformed && <span className="block text-gray-500">Police informed</span>}
                    </td>
                    <td className="p-2.5">
                      <span className={`badge ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                    <td className="p-2.5 text-right">
                      <button className="text-blue-600 text-xs hover:underline" onClick={() => setOpenId(c.id)}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {raising && (
        <RaiseModal
          onClose={() => setRaising(false)}
          onSaved={() => { setRaising(false); qc.invalidateQueries({ queryKey: ['safeguarding'] }); }}
        />
      )}
      {openId && (
        <ConcernModal
          id={openId}
          onClose={() => setOpenId(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['safeguarding'] })}
        />
      )}
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">×</button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function HarmPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {HARM_TYPES.map((h) => (
        <button
          key={h.key}
          type="button"
          onClick={() => toggle(h.key)}
          className={`px-2.5 py-1 rounded-full text-xs border ${
            value.includes(h.key) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          {h.label}
        </button>
      ))}
    </div>
  );
}

function RaiseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ConcernDraft>({ source: 'CARER', harmTypes: [] });
  const [error, setError] = useState<string | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });
  const { data: staff = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const mut = useMutation({
    mutationFn: () => safeguardingApi.create(draft),
    onSuccess: onSaved,
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save that.'),
  });

  const set = <K extends keyof ConcernDraft>(k: K, v: ConcernDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Shell title="Raise a safeguarding concern" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Person at risk — client</label>
          <select className="input" value={draft.serviceUserId || ''} onChange={(e) => set('serviceUserId', e.target.value || null)}>
            <option value="">Not a client on the system</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">…or their name</label>
          <input
            className="input"
            value={draft.personAtRisk || ''}
            onChange={(e) => set('personAtRisk', e.target.value || null)}
            placeholder="If they are not a client"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Who raised it</label>
          <select className="input" value={draft.source} onChange={(e) => set('source', e.target.value)}>
            {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Their name <span className="text-gray-400 font-normal">(if not you)</span></label>
          <input className="input" value={draft.raisedByName || ''} onChange={(e) => set('raisedByName', e.target.value || null)} />
        </div>
      </div>

      <div>
        <label className="label">Type of harm</label>
        <HarmPicker value={draft.harmTypes || []} onChange={(v) => set('harmTypes', v)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">When did it happen</label>
          <input type="date" className="input" value={draft.occurredAt || ''} onChange={(e) => set('occurredAt', e.target.value || null)} />
        </div>
        <div>
          <label className="label">Does it concern a member of staff?</label>
          <select className="input" value={draft.staffInvolvedId || ''} onChange={(e) => set('staffInvolvedId', e.target.value || null)}>
            <option value="">No</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">What happened *</label>
        <textarea
          className="input"
          rows={4}
          value={draft.description || ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What was seen, heard or reported — in the words it was told to you where you can."
        />
      </div>

      <div>
        <label className="label">What was done straight away</label>
        <textarea
          className="input"
          rows={2}
          value={draft.immediateAction || ''}
          onChange={(e) => set('immediateAction', e.target.value || null)}
          placeholder="Who was told, what was made safe, any emergency services called."
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t pt-4">
        <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
        <button className="btn-primary btn" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Saving…' : 'Record concern'}
        </button>
      </div>
    </Shell>
  );
}

function ConcernModal({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [patch, setPatch] = useState<ConcernPatch>({});
  const [error, setError] = useState<string | null>(null);

  const { data: c, isLoading, refetch } = useQuery({ queryKey: ['safeguarding', id], queryFn: () => safeguardingApi.get(id) });

  const mut = useMutation({
    mutationFn: (body: ConcernPatch) => safeguardingApi.update(id, body),
    onSuccess: () => { setPatch({}); setError(null); refetch(); onSaved(); },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not save that.'),
  });

  if (isLoading || !c) {
    return (
      <Shell title="Safeguarding concern" onClose={onClose}>
        <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
      </Shell>
    );
  }

  const v = <K extends keyof ConcernPatch>(k: K, fallback: unknown): string =>
    String((patch[k] ?? fallback ?? '') as string).slice(0, 10000);
  const f = <K extends keyof ConcernPatch>(k: K, fallback: boolean): boolean =>
    (patch[k] as boolean | undefined) ?? fallback;
  const set = <K extends keyof ConcernPatch>(k: K, val: ConcernPatch[K]) => setPatch((p) => ({ ...p, [k]: val }));
  const dateVal = (k: keyof ConcernPatch, fallback: string | null) =>
    ((patch[k] as string | undefined) ?? (fallback ? fallback.slice(0, 10) : '')) || '';

  return (
    <Shell title={`Concern — ${personOf(c)}`} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`badge ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        <span className="text-gray-500">Raised {fmt(c.raisedAt)}</span>
        {c.raisedBy && <span className="text-gray-500">by {c.raisedBy.firstName} {c.raisedBy.lastName}</span>}
        {c.occurredAt && <span className="text-gray-500">· happened {fmt(c.occurredAt)}</span>}
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">What happened</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.description}</p>
        </div>
        {c.immediateAction && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Done straight away</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.immediateAction}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Type</p>
          <HarmChips json={c.harmTypes} />
        </div>
        {c.staffInvolved && (
          <p className="text-sm text-red-700">
            Concerns a member of staff: <strong>{c.staffInvolved.firstName} {c.staffInvolved.lastName}</strong>
          </p>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="font-semibold text-gray-900 text-sm">Referrals and notifications</p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f('referredToLA', c.referredToLA)} onChange={(e) => set('referredToLA', e.target.checked)} />
          Referred to the local authority safeguarding team
        </label>
        {f('referredToLA', c.referredToLA) && (
          <div className="grid gap-3 sm:grid-cols-3 pl-6">
            <input className="input" placeholder="Local authority" value={v('laName', c.laName)} onChange={(e) => set('laName', e.target.value)} />
            <input className="input" placeholder="Reference number" value={v('laReference', c.laReference)} onChange={(e) => set('laReference', e.target.value)} />
            <input type="date" className="input" value={dateVal('laReferralDate', c.laReferralDate)} onChange={(e) => set('laReferralDate', e.target.value || null)} />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f('cqcNotified', c.cqcNotified)} onChange={(e) => set('cqcNotified', e.target.checked)} />
          Statutory notification sent to CQC
        </label>
        {f('cqcNotified', c.cqcNotified) && (
          <div className="grid gap-3 sm:grid-cols-2 pl-6">
            <input className="input" placeholder="CQC reference" value={v('cqcReference', c.cqcReference)} onChange={(e) => set('cqcReference', e.target.value)} />
            <input type="date" className="input" value={dateVal('cqcNotifiedDate', c.cqcNotifiedDate)} onChange={(e) => set('cqcNotifiedDate', e.target.value || null)} />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f('policeInformed', c.policeInformed)} onChange={(e) => set('policeInformed', e.target.checked)} />
          Police informed
        </label>
        {f('policeInformed', c.policeInformed) && (
          <div className="pl-6">
            <input className="input" placeholder="Crime / incident number" value={v('policeReference', c.policeReference)} onChange={(e) => set('policeReference', e.target.value)} />
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="font-semibold text-gray-900 text-sm">Outcome</p>
        <textarea
          className="input"
          rows={3}
          placeholder="What was found, and what happened as a result."
          value={v('outcome', c.outcome)}
          onChange={(e) => set('outcome', e.target.value)}
        />
        <textarea
          className="input"
          rows={2}
          placeholder="Lessons learned — what changed in practice because of this."
          value={v('lessonsLearned', c.lessonsLearned)}
          onChange={(e) => set('lessonsLearned', e.target.value)}
        />
        {c.closedAt && (
          <p className="text-xs text-gray-500">
            Closed {fmt(c.closedAt)}{c.closedBy ? ` by ${c.closedBy.firstName} ${c.closedBy.lastName}` : ''}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <div className="flex gap-2">
          {(['OPEN', 'INVESTIGATING', 'REFERRED'] as ConcernStatus[])
            .filter((s) => s !== c.status)
            .map((s) => (
              <button key={s} className="btn-secondary btn btn-sm" disabled={mut.isPending} onClick={() => mut.mutate({ ...patch, status: s })}>
                Mark {STATUS_LABEL[s].toLowerCase()}
              </button>
            ))}
          {c.status !== 'CLOSED' && (
            <button className="btn-primary btn btn-sm" disabled={mut.isPending} onClick={() => mut.mutate({ ...patch, status: 'CLOSED' })}>
              Close concern
            </button>
          )}
        </div>
        <button className="btn-primary btn" disabled={mut.isPending || Object.keys(patch).length === 0} onClick={() => mut.mutate(patch)}>
          {mut.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Shell>
  );
}
