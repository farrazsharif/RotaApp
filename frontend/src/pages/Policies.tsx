import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInMonths } from 'date-fns';
import {
  policiesApi,
  Policy,
  PolicyInput,
  POLICY_CATEGORIES,
  categoryLabel,
} from '../api/policies';

// The policy register (Reg 17).
//
// A list of what the service runs on: the title, what it covers, when it was
// last reviewed, and the document. No draft/published states, no audiences, no
// read-and-sign — an inspector asks to see the policies and when they were
// last looked at, and that is the whole screen.

// Not statutory. Annual is the convention, and it is what the dashboard counts.
const REVIEW_MONTHS = 12;

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'That did not save. Please try again.';

const isStale = (p: Policy) =>
  !p.reviewedAt || differenceInMonths(new Date(), new Date(p.reviewedAt)) >= REVIEW_MONTHS;

export default function Policies() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: () => policiesApi.list(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? policies.filter((p) => p.title.toLowerCase().includes(q)) : policies;
  }, [policies, search]);

  // Grouped, because 147 titles as one list is a list nobody reads.
  const grouped = useMemo(() => {
    const map = new Map<string, Policy[]>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return [...map.entries()].sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0])));
  }, [filtered]);

  const stale = policies.filter(isStale).length;
  const noFile = policies.filter((p) => p.files.length === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="text-sm text-gray-500">
            {policies.length} on the register. Regulation 17.
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setAdding(true)}>Add a policy</button>
      </div>

      {(stale > 0 || noFile > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {stale > 0 && <><strong>{stale}</strong> not reviewed in the last {REVIEW_MONTHS} months</>}
          {stale > 0 && noFile > 0 && ' · '}
          {noFile > 0 && <><strong>{noFile}</strong> with no document attached</>}
        </div>
      )}

      <input
        className="input"
        placeholder="Search policies…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="card flex justify-center p-8">
          <div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="text-sm text-gray-400 p-2">
            {search ? 'Nothing matches that.' : 'Nothing on the register yet. Add a policy and attach its PDF.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([cat, rows]) => (
            <div key={cat} className="card">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                {categoryLabel(cat)} <span className="font-normal text-gray-300">· {rows.length}</span>
              </p>
              <div className="divide-y">
                {rows.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className="w-full text-left flex flex-wrap items-center justify-between gap-3 py-2.5 hover:bg-gray-50 px-1 -mx-1 rounded"
                  >
                    <p className="text-sm font-medium text-gray-800 min-w-0">
                      {p.files.length > 0 && <span className="mr-1.5">📄</span>}
                      {p.title}
                    </p>
                    <span className={`text-xs shrink-0 ${isStale(p) ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                      {p.reviewedAt ? `Reviewed ${fmt(p.reviewedAt)}` : 'No review recorded'}
                    </span>
                  </button>
                ))}
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
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: policy } = useQuery({
    queryKey: ['policy', id],
    queryFn: () => policiesApi.get(id!),
    enabled: !!id,
  });

  // Empty, deliberately. `val` prefers anything present in the draft, so a
  // seeded key shadows the saved value - which is how every policy came to
  // show as Other, and would have written Other back on the next save.
  const [draft, setDraft] = useState<PolicyInput>({});
  const set = <K extends keyof PolicyInput>(k: K, v: PolicyInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof PolicyInput>(k: K, fallback: PolicyInput[K]): PolicyInput[K] =>
    k in draft ? draft[k] : fallback;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['policies'] });
    if (id) qc.invalidateQueries({ queryKey: ['policy', id] });
  };

  const save = useMutation({
    mutationFn: (patch: PolicyInput) => (isNew ? policiesApi.create(patch) : policiesApi.update(id!, patch)),
    onSuccess: () => { refresh(); onClose(); },
  });

  const openFile = useMutation({
    mutationFn: () => policiesApi.attachment(id!),
    onSuccess: (d) => window.open(d.url, '_blank', 'noopener'),
  });

  const attach = useMutation({
    mutationFn: (f: File) => policiesApi.attach(id!, f),
    onSuccess: refresh,
  });

  const detach = useMutation({
    mutationFn: () => policiesApi.removeAttachment(id!),
    onSuccess: refresh,
  });

  const file = policy?.files?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-6 sm:my-0">
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {isNew ? 'Add a policy' : policy?.title || 'Policy'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Set once. The title is how a policy is found, and how each of the
              147 documents was matched to its record on import - renaming one
              quietly breaks that link, and there is nothing to be gained. The
              heading above shows it. */}
          {isNew && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Title</p>
              <input
                className="input"
                autoFocus
                value={draft.title ?? ''}
                onChange={(e) => set('title', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">This cannot be changed afterwards.</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Category</p>
              <select
                className="input"
                value={(val('category', policy?.category) ?? 'OTHER') as string}
                onChange={(e) => set('category', e.target.value)}
              >
                {POLICY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Last reviewed</p>
              <input
                type="date"
                className="input"
                value={((val('reviewedAt', policy?.reviewedAt) as string | null) || '').slice(0, 10)}
                onChange={(e) => set('reviewedAt', e.target.value || null)}
              />
            </div>
          </div>

          {!isNew && (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">The document</p>
              {file ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="btn-secondary btn btn-sm"
                    disabled={openFile.isPending}
                    onClick={() => openFile.mutate()}
                  >
                    {openFile.isPending ? 'Opening…' : `📄 ${file.fileName}`}
                  </button>
                  <span className="text-xs text-gray-400">{Math.round(file.size / 1024)} KB</span>
                  <div className="flex-1" />
                  <button
                    className="text-xs text-gray-400 hover:text-red-600"
                    disabled={detach.isPending}
                    onClick={() => { if (window.confirm('Remove the document?')) detach.mutate(); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No document attached.</p>
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
            </div>
          )}

          {(save.isError || attach.isError || openFile.isError || detach.isError) && (
            <p className="text-sm text-red-600">
              {err(save.error || attach.error || openFile.error || detach.error)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1" />
            <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary btn"
              disabled={save.isPending || (isNew && !draft.title?.trim())}
              onClick={() => {
                if (!isNew && Object.keys(draft).length === 0) return onClose();
                save.mutate(draft);
              }}
            >
              {save.isPending ? 'Saving…' : isNew ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
