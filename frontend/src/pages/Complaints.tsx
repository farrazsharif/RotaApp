import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInCalendarDays } from 'date-fns';
import {
  complaintsApi,
  ComplaintSummary,
  ComplaintStatus,
  ComplaintKind,
  ComplaintInput,
  COMPLAINT_CATEGORIES,
  RELATIONSHIPS,
  CHANNELS,
  OUTCOMES,
  ESCALATABLE,
  parseCategories,
  categoryLabel,
  outcomeLabel,
  channelLabel,
} from '../api/complaints';
import { serviceUsersApi } from '../api/serviceUsers';
import { usersApi } from '../api/users';

// The complaints and compliments log (Reg 16).
//
// Laid out around the two clocks that actually matter, because they are the
// two an inspector checks first: how long it took to acknowledge, and how long
// it took to respond. Everything else on this screen is in service of those.

// Not statutory, but the standard most providers' own policies commit to, and
// what the Ombudsman expects to see: acknowledge in 3 working days, respond in
// 28 calendar days.
const ACK_DAYS = 3;
const RESPONSE_DAYS = 28;

const STATUS_STYLE: Record<ComplaintStatus, string> = {
  OPEN: 'bg-red-100 text-red-800',
  INVESTIGATING: 'bg-amber-100 text-amber-800',
  RESPONDED: 'bg-blue-100 text-blue-800',
  CLOSED: 'bg-green-100 text-green-800',
};

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  RESPONDED: 'Responded',
  CLOSED: 'Closed',
};

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
const daysSince = (iso: string) => differenceInCalendarDays(new Date(), new Date(iso));

const aboutOf = (c: ComplaintSummary) =>
  c.serviceUser ? `${c.serviceUser.firstName} ${c.serviceUser.lastName}` : '—';
const fromOf = (c: ComplaintSummary) =>
  c.relationship === 'ANONYMOUS' ? 'Anonymous' : c.complainantName || 'Not named';

// Still waiting on the thing that has a deadline.
const awaitingAck = (c: ComplaintSummary) =>
  c.kind === 'COMPLAINT' && !c.acknowledgedAt && c.status !== 'CLOSED';
const awaitingResponse = (c: ComplaintSummary) =>
  c.kind === 'COMPLAINT' && !c.respondedAt && c.status !== 'CLOSED';

function CategoryChips({ json }: { json: string }) {
  const keys = parseCategories(json);
  if (!keys.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="badge bg-gray-100 text-gray-700 text-xs">{categoryLabel(k)}</span>
      ))}
    </span>
  );
}

export default function Complaints() {
  const [kind, setKind] = useState<ComplaintKind>('COMPLAINT');
  const [filter, setFilter] = useState<'open' | 'all' | ComplaintStatus>('open');
  const [logging, setLogging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['complaints', kind, filter],
    queryFn: () =>
      complaintsApi.list({
        kind,
        ...(filter === 'open' ? { open: true } : filter === 'all' ? {} : { status: filter }),
      }),
  });

  const compliments = kind === 'COMPLIMENT';

  const counts = useMemo(() => {
    const open = rows.filter((c) => c.status !== 'CLOSED').length;
    const ackLate = rows.filter((c) => awaitingAck(c) && daysSince(c.receivedAt) > ACK_DAYS).length;
    const respLate = rows.filter((c) => awaitingResponse(c) && daysSince(c.receivedAt) > RESPONSE_DAYS).length;
    return { open, ackLate, respLate };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Complaints &amp; compliments</h1>
          <p className="text-sm text-gray-500">
            What was said, what was done about it, and what changed. Regulation 16.
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setLogging(true)}>
          {compliments ? 'Record a compliment' : 'Log a complaint'}
        </button>
      </div>

      <div className="flex gap-1.5 border-b border-gray-200">
        {([['COMPLAINT', 'Complaints'], ['COMPLIMENT', 'Compliments']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setKind(k); setFilter(k === 'COMPLIMENT' ? 'all' : 'open'); }}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              kind === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!compliments && (counts.ackLate > 0 || counts.respLate > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {counts.ackLate > 0 && (
            <>
              <strong>{counts.ackLate}</strong> not acknowledged within {ACK_DAYS} working days
            </>
          )}
          {counts.ackLate > 0 && counts.respLate > 0 && ' · '}
          {counts.respLate > 0 && (
            <>
              <strong>{counts.respLate}</strong> past {RESPONSE_DAYS} days with no response
            </>
          )}
        </div>
      )}

      {!compliments && (
        <div className="flex flex-wrap gap-1.5">
          {([
            ['open', 'Open'],
            ['INVESTIGATING', 'Investigating'],
            ['RESPONDED', 'Responded'],
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
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center p-8"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 p-2">
            {compliments ? 'No compliments recorded yet.' : filter === 'open' ? 'Nothing open.' : 'Nothing recorded here yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="text-left p-2.5 font-medium">Received</th>
                  <th className="text-left p-2.5 font-medium">From</th>
                  <th className="text-left p-2.5 font-medium">About</th>
                  {!compliments && <th className="text-left p-2.5 font-medium">Categories</th>}
                  {!compliments && <th className="text-left p-2.5 font-medium">Acknowledged</th>}
                  {!compliments && <th className="text-left p-2.5 font-medium">Responded</th>}
                  {!compliments && <th className="text-left p-2.5 font-medium">Outcome</th>}
                  <th className="text-left p-2.5 font-medium">Status</th>
                  <th className="p-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((c) => {
                  const ackLate = awaitingAck(c) && daysSince(c.receivedAt) > ACK_DAYS;
                  const respLate = awaitingResponse(c) && daysSince(c.receivedAt) > RESPONSE_DAYS;
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="p-2.5 whitespace-nowrap">
                        {fmt(c.receivedAt)}
                        {c.reference && <div className="text-xs text-gray-400">{c.reference}</div>}
                      </td>
                      <td className="p-2.5">
                        {fromOf(c)}
                        <div className="text-xs text-gray-400">{channelLabel(c.channel)}</div>
                      </td>
                      <td className="p-2.5">
                        {aboutOf(c)}
                        {c.staffInvolved && (
                          <div className="text-xs text-gray-400">
                            Staff: {c.staffInvolved.firstName} {c.staffInvolved.lastName}
                          </div>
                        )}
                      </td>
                      {!compliments && <td className="p-2.5"><CategoryChips json={c.categories} /></td>}
                      {!compliments && (
                        <td className={`p-2.5 whitespace-nowrap ${ackLate ? 'text-red-700 font-semibold' : ''}`}>
                          {c.acknowledgedAt ? fmt(c.acknowledgedAt) : ackLate ? `${daysSince(c.receivedAt)} days` : '—'}
                        </td>
                      )}
                      {!compliments && (
                        <td className={`p-2.5 whitespace-nowrap ${respLate ? 'text-red-700 font-semibold' : ''}`}>
                          {c.respondedAt ? fmt(c.respondedAt) : respLate ? `${daysSince(c.receivedAt)} days` : '—'}
                        </td>
                      )}
                      {!compliments && (
                        <td className="p-2.5 whitespace-nowrap">
                          {outcomeLabel(c.outcome) || '—'}
                          {c.escalatedToOmbudsman && <div className="text-xs text-purple-700">Ombudsman</div>}
                        </td>
                      )}
                      <td className="p-2.5">
                        <span className={`badge ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td className="p-2.5 text-right">
                        <button className="text-blue-600 hover:underline text-sm" onClick={() => setOpenId(c.id)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logging && <LogModal kind={kind} onClose={() => setLogging(false)} />}
      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// --- Logging one -----------------------------------------------------------

function LogModal({ kind, onClose }: { kind: ComplaintKind; onClose: () => void }) {
  const qc = useQueryClient();
  const compliment = kind === 'COMPLIMENT';

  const [form, setForm] = useState<ComplaintInput>({
    kind,
    relationship: 'CLIENT',
    channel: 'PHONE',
    receivedAt: new Date().toISOString().slice(0, 10),
    categories: [],
    summary: '',
  });
  const set = <K extends keyof ComplaintInput>(k: K, v: ComplaintInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data: clients = [] } = useQuery({
    queryKey: ['serviceUsers', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });
  const { data: staff = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const save = useMutation({
    mutationFn: () => complaintsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      onClose();
    },
  });

  const toggleCategory = (key: string) => {
    const cur = form.categories ?? [];
    set('categories', cur.includes(key) ? cur.filter((c) => c !== key) : [...cur, key]);
  };

  return (
    <Modal title={compliment ? 'Record a compliment' : 'Log a complaint'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label="Received on">
            <input
              type="date"
              className="input"
              value={(form.receivedAt || '').slice(0, 10)}
              onChange={(e) => set('receivedAt', e.target.value || null)}
            />
          </Labelled>
          <Labelled label="How it came in">
            <select className="input" value={form.channel} onChange={(e) => set('channel', e.target.value)}>
              {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Labelled>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label="Who said it">
            <input
              className="input"
              placeholder="Name"
              value={form.complainantName || ''}
              onChange={(e) => set('complainantName', e.target.value)}
            />
          </Labelled>
          <Labelled label="Their relationship">
            <select className="input" value={form.relationship} onChange={(e) => set('relationship', e.target.value)}>
              {RELATIONSHIPS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Labelled>
        </div>

        {!compliment && (
          <Labelled label="How to contact them" hint="Leave blank for an anonymous complaint — it is still a complaint.">
            <input
              className="input"
              placeholder="Phone or email"
              value={form.complainantContact || ''}
              onChange={(e) => set('complainantContact', e.target.value)}
            />
          </Labelled>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label="About which client" hint="Leave blank if it is not about a particular person.">
            <select
              className="input"
              value={form.serviceUserId || ''}
              onChange={(e) => set('serviceUserId', e.target.value || null)}
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </Labelled>
          <Labelled label="About which member of staff">
            <select
              className="input"
              value={form.staffInvolvedId || ''}
              onChange={(e) => set('staffInvolvedId', e.target.value || null)}
            >
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </select>
          </Labelled>
        </div>

        {!compliment && (
          <Labelled label="What it is about">
            <div className="flex flex-wrap gap-1.5">
              {COMPLAINT_CATEGORIES.map((c) => {
                const on = (form.categories ?? []).includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCategory(c.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Labelled>
        )}

        <Labelled
          label={compliment ? 'What was said' : 'What the complaint is'}
          hint={compliment ? undefined : 'In their words where you can. A tidied summary is worth less later.'}
        >
          <textarea
            className="input"
            rows={5}
            value={form.summary || ''}
            onChange={(e) => set('summary', e.target.value)}
          />
        </Labelled>

        {save.isError && (
          <p className="text-sm text-red-600">
            {(save.error as { response?: { data?: { error?: string } } })?.response?.data?.error
              || 'That did not save. Please try again.'}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary btn"
            disabled={!form.summary?.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : compliment ? 'Record it' : 'Log it'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- Handling one ----------------------------------------------------------

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({ queryKey: ['complaint', id], queryFn: () => complaintsApi.get(id) });

  const [draft, setDraft] = useState<ComplaintInput>({});
  const set = <K extends keyof ComplaintInput>(k: K, v: ComplaintInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof ComplaintInput>(k: K, fallback: ComplaintInput[K]): ComplaintInput[K] =>
    k in draft ? draft[k] : fallback;

  const save = useMutation({
    mutationFn: (patch: ComplaintInput) => complaintsApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      setDraft({});
    },
  });

  if (isLoading || !c) {
    return (
      <Modal title="Complaint" onClose={onClose}>
        <p className="text-sm text-gray-400">Loading…</p>
      </Modal>
    );
  }

  const compliment = c.kind === 'COMPLIMENT';
  const outcome = (val('outcome', c.outcome) ?? '') as string;
  const signposted = (val('ombudsmanSignposted', c.ombudsmanSignposted) ?? false) as boolean;
  const needsSignpost = ESCALATABLE.includes(outcome) && !signposted;

  return (
    <Modal title={compliment ? 'Compliment' : `Complaint${c.reference ? ` · ${c.reference}` : ''}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">What was said</p>
            <span className={`badge ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.summary}</p>
          <p className="text-xs text-gray-500">
            {fromOf(c)} · {channelLabel(c.channel)} · received {fmt(c.receivedAt)}
            {c.receivedBy ? ` · logged by ${c.receivedBy.firstName} ${c.receivedBy.lastName}` : ''}
          </p>
          {c.complainantContact && <p className="text-xs text-gray-500">Contact: {c.complainantContact}</p>}
          {!compliment && <CategoryChips json={c.categories} />}
        </div>

        {!compliment && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <Labelled label="Acknowledged on" hint={`Within ${ACK_DAYS} working days.`}>
                <input
                  type="date"
                  className="input"
                  value={((val('acknowledgedAt', c.acknowledgedAt) as string | null) || '').slice(0, 10)}
                  onChange={(e) => set('acknowledgedAt', e.target.value || null)}
                />
              </Labelled>
              <Labelled label="Our reference">
                <input
                  className="input"
                  value={(val('reference', c.reference) ?? '') as string}
                  onChange={(e) => set('reference', e.target.value)}
                />
              </Labelled>
            </div>

            <Labelled label="What we found" hint="Who was spoken to, what the records showed.">
              <textarea
                className="input"
                rows={4}
                value={(val('investigation', c.investigation) ?? '') as string}
                onChange={(e) => set('investigation', e.target.value)}
              />
            </Labelled>

            <div className="grid sm:grid-cols-2 gap-3">
              <Labelled label="Outcome">
                <select
                  className="input"
                  value={outcome}
                  onChange={(e) => set('outcome', e.target.value || null)}
                >
                  <option value="">—</option>
                  {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Labelled>
              <Labelled label="Responded on">
                <input
                  type="date"
                  className="input"
                  value={((val('respondedAt', c.respondedAt) as string | null) || '').slice(0, 10)}
                  onChange={(e) => set('respondedAt', e.target.value || null)}
                />
              </Labelled>
            </div>

            <Labelled label="What we did about it">
              <textarea
                className="input"
                rows={3}
                value={(val('actionsTaken', c.actionsTaken) ?? '') as string}
                onChange={(e) => set('actionsTaken', e.target.value)}
              />
            </Labelled>

            <Labelled label="What changed as a result" hint="The part that turns a complaint into learning. Inspectors ask for this one by name.">
              <textarea
                className="input"
                rows={3}
                value={(val('lessonsLearned', c.lessonsLearned) ?? '') as string}
                onChange={(e) => set('lessonsLearned', e.target.value)}
              />
            </Labelled>

            <div className={`rounded-xl border p-3 space-y-2 ${needsSignpost ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Ombudsman</p>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={signposted}
                  onChange={(e) => set('ombudsmanSignposted', e.target.checked)}
                />
                We told them they can take it to the Local Government &amp; Social Care Ombudsman
              </label>
              {needsSignpost && (
                <p className="text-xs text-amber-800">
                  This outcome gives them the right to go further. They cannot use it unless they are told.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={(val('escalatedToOmbudsman', c.escalatedToOmbudsman) ?? false) as boolean}
                  onChange={(e) => set('escalatedToOmbudsman', e.target.checked)}
                />
                They have taken it to the Ombudsman
              </label>
              {(val('escalatedToOmbudsman', c.escalatedToOmbudsman) ?? false) && (
                <input
                  className="input"
                  placeholder="Ombudsman reference"
                  value={(val('ombudsmanReference', c.ombudsmanReference) ?? '') as string}
                  onChange={(e) => set('ombudsmanReference', e.target.value)}
                />
              )}
            </div>
          </>
        )}

        {c.status === 'CLOSED' && c.closedAt && (
          <p className="text-sm text-green-700 font-medium">
            Closed {fmt(c.closedAt)}
            {c.closedBy ? ` by ${c.closedBy.firstName} ${c.closedBy.lastName}` : ''}.
          </p>
        )}

        {save.isError && (
          <p className="text-sm text-red-600">
            {(save.error as { response?: { data?: { error?: string } } })?.response?.data?.error
              || 'That did not save. Please try again.'}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary btn" onClick={onClose}>Close</button>
          {!compliment && (
            <>
              <button
                className="btn-secondary btn"
                disabled={save.isPending}
                onClick={() => save.mutate({ ...draft, status: c.status === 'OPEN' ? 'INVESTIGATING' : undefined })}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
              {c.status !== 'CLOSED' ? (
                <button
                  className="btn-primary btn"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ ...draft, status: 'CLOSED' })}
                >
                  Save &amp; close
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
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// --- Small shared pieces ---------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6 sm:my-0 max-h-[92vh] flex flex-col">
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
