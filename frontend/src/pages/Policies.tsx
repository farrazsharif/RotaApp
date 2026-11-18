import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  policiesApi,
  Policy,
  PolicySummary,
  PolicyInput,
  PolicyStatus,
  POLICY_CATEGORIES,
  AUDIENCES,
  categoryLabel,
  audienceLabel,
} from '../api/policies';
import { usersApi } from '../api/users';

// The policy library (Reg 17).
//
// Built around the question an inspector asks, which is never "do you have a
// medication policy". It is "show me who has read it" — so the signature
// count is on every row, and opening one leads with who has NOT signed.

const STATUS_STYLE: Record<PolicyStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'That did not save. Please try again.';

export default function Policies() {
  const [filter, setFilter] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'all'>('ACTIVE');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['policies', filter],
    queryFn: () => policiesApi.list(filter === 'all' ? {} : { status: filter }),
  });

  const counts = useMemo(() => {
    const active = policies.filter((p) => p.status === 'ACTIVE');
    const overdue = active.filter((p) => p.reviewDate && new Date(p.reviewDate) < new Date()).length;
    const unsigned = active.reduce((n, p) => n + Math.max(0, p.dueCount - p.signedCount), 0);
    return { overdue, unsigned };
  }, [policies]);

  // Grouped, because a library read as one long list is a list nobody reads.
  const grouped = useMemo(() => {
    const map = new Map<string, PolicySummary[]>();
    for (const p of policies) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return [...map.entries()].sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0])));
  }, [policies]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="text-sm text-gray-500">
            Version, review date, and who has read it. Regulation 17.
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setAdding(true)}>Add a policy</button>
      </div>

      {(counts.overdue > 0 || counts.unsigned > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {counts.overdue > 0 && <><strong>{counts.overdue}</strong> past their review date</>}
          {counts.overdue > 0 && counts.unsigned > 0 && ' · '}
          {counts.unsigned > 0 && <><strong>{counts.unsigned}</strong> signature{counts.unsigned === 1 ? '' : 's'} outstanding</>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {([['ACTIVE', 'Published'], ['DRAFT', 'Drafts'], ['ARCHIVED', 'Archived'], ['all', 'All']] as const).map(
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

      {isLoading ? (
        <div className="card flex justify-center p-8">
          <div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" />
        </div>
      ) : policies.length === 0 ? (
        <div className="card">
          <p className="text-sm text-gray-400 p-2">
            Nothing here yet. Add your policies as you go — each one needs a version, a review date and an
            audience, and the people it applies to are asked to sign it when you publish.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, rows]) => (
            <div key={cat} className="card">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{categoryLabel(cat)}</p>
              <div className="divide-y">
                {rows.map((p) => {
                  const overdue = !!p.reviewDate && new Date(p.reviewDate) < new Date();
                  const outstanding = Math.max(0, p.dueCount - p.signedCount);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setOpenId(p.id)}
                      className="w-full text-left flex flex-wrap items-center justify-between gap-3 py-2.5 hover:bg-gray-50 px-1 -mx-1 rounded"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {p.title}
                          {p.reference && <span className="text-gray-400 font-normal"> · {p.reference}</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          v{p.version} · issued {fmt(p.issuedAt)} · {audienceLabel(p.audience)}
                          {p.files?.length ? ' · 📄 PDF' : ''}
                          {p.reviewDate && (
                            <span className={overdue ? 'text-red-600 font-medium' : ''}>
                              {' '}· review {overdue ? 'overdue' : 'due'} {fmt(p.reviewDate)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.status === 'ACTIVE' && p.requiresAck && (
                          <span className={`badge ${outstanding ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                            {p.signedCount}/{p.dueCount} signed
                          </span>
                        )}
                        <span className={`badge ${STATUS_STYLE[p.status]}`}>{p.status.toLowerCase()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <PolicyModal onClose={() => setAdding(false)} />}
      {openId && <PolicyModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function PolicyModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !id;

  const { data: policy } = useQuery({
    queryKey: ['policy', id],
    queryFn: () => policiesApi.get(id!),
    enabled: !!id,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const [draft, setDraft] = useState<PolicyInput>({ category: 'OTHER', audience: 'ALL', version: '1.0' });
  const set = <K extends keyof PolicyInput>(k: K, v: PolicyInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof PolicyInput>(k: K, fallback: PolicyInput[K]): PolicyInput[K] =>
    k in draft ? draft[k] : fallback;

  const save = useMutation({
    mutationFn: (patch: PolicyInput) =>
      isNew ? policiesApi.create(patch) : policiesApi.update(id!, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      if (id) qc.invalidateQueries({ queryKey: ['policy', id] });
      if (isNew) onClose();
      else setDraft({});
    },
  });

  const remove = useMutation({
    mutationFn: () => policiesApi.remove(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      onClose();
    },
  });

  const versionChanged = !!policy && !!draft.version && draft.version !== policy.version;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6 sm:my-0 max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNew ? 'Add a policy' : policy?.title || 'Policy'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Labelled label="Title">
              <input
                className="input"
                value={(val('title', policy?.title) ?? '') as string}
                onChange={(e) => set('title', e.target.value)}
              />
            </Labelled>
            <Labelled label="Reference">
              <input
                className="input"
                placeholder="POL-012"
                value={(val('reference', policy?.reference) ?? '') as string}
                onChange={(e) => set('reference', e.target.value)}
              />
            </Labelled>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Labelled label="Category">
              <select
                className="input"
                value={(val('category', policy?.category) ?? 'OTHER') as string}
                onChange={(e) => set('category', e.target.value)}
              >
                {POLICY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Labelled>
            <Labelled label="Policy owner">
              <select
                className="input"
                value={(val('ownerId', policy?.owner?.id) ?? '') as string}
                onChange={(e) => set('ownerId', e.target.value || null)}
              >
                <option value="">—</option>
                {staff.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </Labelled>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Labelled
              label="Version"
              hint={versionChanged ? 'Changing this asks everyone to sign again.' : undefined}
            >
              <input
                className="input"
                value={(val('version', policy?.version) ?? '1.0') as string}
                onChange={(e) => set('version', e.target.value)}
              />
            </Labelled>
            <Labelled label="Issued">
              <input
                type="date"
                className="input"
                value={((val('issuedAt', policy?.issuedAt) as string | null) || '').slice(0, 10)}
                onChange={(e) => set('issuedAt', e.target.value || null)}
              />
            </Labelled>
            <Labelled label="Review by">
              <input
                type="date"
                className="input"
                value={((val('reviewDate', policy?.reviewDate) as string | null) || '').slice(0, 10)}
                onChange={(e) => set('reviewDate', e.target.value || null)}
              />
            </Labelled>
          </div>

          <Labelled label="Who has to read it">
            <select
              className="input"
              value={(val('audience', policy?.audience) ?? 'ALL') as string}
              onChange={(e) => set('audience', e.target.value)}
            >
              {AUDIENCES.map((a) => <option key={a.key} value={a.key}>{a.label} — {a.hint}</option>)}
            </select>
          </Labelled>

          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={(val('requiresAck', policy?.requiresAck) ?? true) as boolean}
              onChange={(e) => set('requiresAck', e.target.checked)}
            />
            Staff must read and sign this
          </label>

          {policy && <AttachmentBlock policy={policy} />}

          <Labelled label="The policy" hint="What staff read on screen. It reflows and searches, which the PDF does not.">
            <textarea
              className="input font-mono text-xs"
              rows={12}
              value={(val('bodyText', policy?.bodyText) ?? '') as string}
              onChange={(e) => set('bodyText', e.target.value)}
            />
          </Labelled>

          {policy && (
            <div className="border-t pt-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">
                  Still to sign v{policy.version}
                </p>
                {!policy.requiresAck ? (
                  <p className="text-sm text-gray-400">This policy does not ask for signatures.</p>
                ) : policy.outstanding.length === 0 ? (
                  <p className="text-sm text-green-700 font-medium">
                    Everyone it applies to has signed this version.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {policy.outstanding.map((u) => (
                      <span key={u.id} className="badge bg-amber-100 text-amber-800">
                        {u.firstName} {u.lastName}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {policy.acknowledgements.length > 0 && (
                <details>
                  <summary className="text-xs font-bold uppercase tracking-wide text-gray-400 cursor-pointer">
                    Signatures ({policy.acknowledgements.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {policy.acknowledgements.map((a) => (
                      <p key={a.id} className="text-xs text-gray-600">
                        {a.user.firstName} {a.user.lastName} · v{a.version} ·{' '}
                        {format(new Date(a.signedAt), 'dd MMM yyyy, HH:mm')}
                        {a.version !== policy.version && <span className="text-amber-700"> · older version</span>}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {(save.isError || remove.isError) && (
            <p className="text-sm text-red-600">{err(save.error || remove.error)}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 border-t shrink-0">
          {policy && policy.status !== 'ARCHIVED' && (
            <button
              className="text-sm text-gray-400 hover:text-red-600"
              onClick={() => {
                if (policy.acknowledgements.length > 0) {
                  save.mutate({ ...draft, status: 'ARCHIVED' });
                } else if (window.confirm('Delete this policy?')) {
                  remove.mutate();
                }
              }}
            >
              {policy.acknowledgements.length > 0 ? 'Archive' : 'Delete'}
            </button>
          )}
          <div className="flex-1" />
          <button className="btn-secondary btn" onClick={onClose}>Close</button>
          <button
            className="btn-secondary btn"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          {policy && policy.status !== 'ACTIVE' && (
            <button
              className="btn-primary btn"
              disabled={save.isPending}
              onClick={() => save.mutate({ ...draft, status: 'ACTIVE' })}
            >
              Publish
            </button>
          )}
          {isNew && (
            <button
              className="btn-primary btn"
              disabled={!draft.title?.trim() || save.isPending}
              onClick={() => save.mutate(draft)}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The original document. Shown above the text because that is the order the
// office thinks in: "which policy is this, and can I print it" comes before
// "what does it say".
function AttachmentBlock({ policy }: { policy: Policy }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const file = policy.files?.[0];

  const open = useMutation({
    mutationFn: () => policiesApi.attachment(policy.id),
    // A signed URL, good for five minutes, straight to storage — the bytes
    // never come back through the API.
    onSuccess: (d) => window.open(d.url, '_blank', 'noopener'),
  });

  const attach = useMutation({
    mutationFn: (f: File) => policiesApi.attach(policy.id, f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policy', policy.id] }),
  });

  const remove = useMutation({
    mutationFn: () => policiesApi.removeAttachment(policy.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policy', policy.id] }),
  });

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
        The original document
      </p>
      {file ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-secondary btn btn-sm"
            disabled={open.isPending}
            onClick={() => open.mutate()}
          >
            {open.isPending ? 'Opening…' : `📄 ${file.fileName}`}
          </button>
          <span className="text-xs text-gray-400">{Math.round(file.size / 1024)} KB</span>
          <div className="flex-1" />
          <button
            className="text-xs text-gray-400 hover:text-red-600"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Remove the attached document? The text stays.')) remove.mutate();
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          Nothing attached. A PDF is what prints with its tables intact and what goes in an inspection pack.
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) attach.mutate(f);
          e.target.value = '';
        }}
      />
      <button
        className="btn-secondary btn btn-sm mt-2"
        disabled={attach.isPending}
        onClick={() => fileInput.current?.click()}
      >
        {attach.isPending ? 'Uploading…' : file ? 'Replace the PDF' : 'Attach a PDF'}
      </button>

      {(attach.isError || open.isError || remove.isError) && (
        <p className="text-sm text-red-600 mt-1">{err(attach.error || open.error || remove.error)}</p>
      )}
    </div>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      {children}
      {hint && <p className="text-xs text-amber-700 mt-1">{hint}</p>}
    </div>
  );
}
