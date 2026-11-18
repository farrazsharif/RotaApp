import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  capacityApi,
  CapacityAssessment,
  CapacityPatch,
  LegalAuthority,
  AuthorityPatch,
  CAPACITY_CATEGORIES,
  AUTHORITY_KINDS,
  FUNCTIONAL_TEST,
  categoryLabel,
  authorityLabel,
} from '../api/capacity';

// Mental capacity, on the client record where it belongs.
//
// Two things that answer one question between them: who may decide, and on
// what basis. A decision-by-decision assessment history, and the standing
// legal authorities with a record of whether anyone has actually seen the
// paperwork.

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'That did not save. Please try again.';

export default function MentalCapacitySection({
  serviceUserId,
  canEdit,
}: {
  serviceUserId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingAuthority, setAddingAuthority] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['capacity', serviceUserId],
    queryFn: () => capacityApi.forServiceUser(serviceUserId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['capacity', serviceUserId] });

  const assessments = data?.assessments ?? [];
  const authorities = data?.authorities ?? [];

  return (
    <div id="doc-mental-capacity" className="card p-4 space-y-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Mental Capacity</h2>
          <p className="text-xs text-gray-500">
            Capacity is assessed for one decision at a time. Everyone is presumed to have it until an
            assessment here shows otherwise.
          </p>
        </div>
        {canEdit && (
          <button className="btn-secondary btn btn-sm shrink-0" onClick={() => setAdding(true)}>
            Assess a decision
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          {assessments.length === 0 ? (
            <p className="text-sm text-gray-400">
              No capacity assessments. That is the right state unless something gives you reason to doubt
              this person can make a particular decision.
            </p>
          ) : (
            <div className="space-y-2">
              {assessments.map((a) => {
                const overdue = !!a.reviewDate && new Date(a.reviewDate) < new Date();
                return (
                  <button
                    key={a.id}
                    onClick={() => setOpenId(a.id)}
                    className="w-full text-left flex items-start justify-between gap-3 border-b last:border-0 pb-2 last:pb-0 hover:bg-gray-50 rounded px-1 -mx-1"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{a.decision}</p>
                      <p className="text-xs text-gray-500">
                        {categoryLabel(a.category)} · assessed {fmt(a.assessedAt)}
                        {a.assessedBy ? ` by ${a.assessedBy.firstName} ${a.assessedBy.lastName}` : ''}
                        {a.reviewDate && (
                          <span className={overdue ? 'text-red-600 font-medium' : ''}>
                            {' '}· review {overdue ? 'overdue' : 'due'} {fmt(a.reviewDate)}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`badge shrink-0 ${
                      a.outcome === 'LACKS_CAPACITY'
                        ? 'bg-amber-100 text-amber-800'
                        : a.outcome === 'HAS_CAPACITY'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}>
                      {a.outcome === 'LACKS_CAPACITY' ? 'Lacks capacity' : a.outcome === 'HAS_CAPACITY' ? 'Has capacity' : 'In progress'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Who may decide</p>
                <p className="text-xs text-gray-500">
                  An LPA confers no authority until it is registered, and none at all until somebody has seen it.
                </p>
              </div>
              {canEdit && (
                <button className="btn-secondary btn btn-sm shrink-0" onClick={() => setAddingAuthority(true)}>
                  Add
                </button>
              )}
            </div>

            {authorities.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing recorded.</p>
            ) : (
              <div className="space-y-2">
                {authorities.map((la) => (
                  <AuthorityRow
                    key={la.id}
                    authority={la}
                    canEdit={canEdit}
                    onChanged={invalidate}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {adding && (
        <NewAssessmentModal
          serviceUserId={serviceUserId}
          onClose={() => setAdding(false)}
          onCreated={(id) => { invalidate(); setAdding(false); setOpenId(id); }}
        />
      )}
      {addingAuthority && (
        <NewAuthorityModal
          serviceUserId={serviceUserId}
          onClose={() => setAddingAuthority(false)}
          onCreated={() => { invalidate(); setAddingAuthority(false); }}
        />
      )}
      {openId && (
        <AssessmentModal
          assessment={assessments.find((a) => a.id === openId)!}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

// --- Legal authority row ---------------------------------------------------

function AuthorityRow({
  authority,
  canEdit,
  onChanged,
}: {
  authority: LegalAuthority;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const save = useMutation({
    mutationFn: (patch: AuthorityPatch) => capacityApi.updateAuthority(authority.id, patch),
    onSuccess: onChanged,
  });

  // An unregistered LPA is the one that catches people out: it looks like
  // authority and is not.
  const lpaOrDeputy = authority.kind.startsWith('LPA_') || authority.kind.startsWith('DEPUTY_');
  const problem = !authority.evidenceSeen
    ? 'Nobody has recorded seeing this document.'
    : lpaOrDeputy && !authority.registered
      ? 'Not registered — this confers no authority.'
      : null;

  return (
    <div className={`rounded-lg border p-2.5 ${problem ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {authorityLabel(authority.kind)}
            {!authority.active && <span className="ml-2 badge bg-gray-100 text-gray-500">Ended</span>}
          </p>
          <p className="text-xs text-gray-600">
            {authority.holderName || 'No name recorded'}
            {authority.holderContact ? ` · ${authority.holderContact}` : ''}
            {authority.reference ? ` · ${authority.reference}` : ''}
          </p>
          {authority.scope && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{authority.scope}</p>}
          {problem && <p className="text-xs text-amber-800 font-medium mt-1">{problem}</p>}
          {authority.evidenceSeen && (
            <p className="text-xs text-gray-500 mt-0.5">
              Seen {fmt(authority.evidenceSeenAt)}
              {authority.evidenceSeenBy ? ` by ${authority.evidenceSeenBy.firstName} ${authority.evidenceSeenBy.lastName}` : ''}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-1 shrink-0 text-xs">
            <label className="flex items-center gap-1.5 text-gray-700">
              <input
                type="checkbox"
                checked={authority.evidenceSeen}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ evidenceSeen: e.target.checked })}
              />
              Seen it
            </label>
            {lpaOrDeputy && (
              <label className="flex items-center gap-1.5 text-gray-700">
                <input
                  type="checkbox"
                  checked={authority.registered}
                  disabled={save.isPending}
                  onChange={(e) => save.mutate({ registered: e.target.checked })}
                />
                Registered
              </label>
            )}
          </div>
        )}
      </div>
      {save.isError && <p className="text-xs text-red-600 mt-1">{err(save.error)}</p>}
    </div>
  );
}

// --- New assessment --------------------------------------------------------

function NewAssessmentModal({
  serviceUserId,
  onClose,
  onCreated,
}: {
  serviceUserId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [decision, setDecision] = useState('');
  const [category, setCategory] = useState('OTHER');

  const create = useMutation({
    mutationFn: () => capacityApi.createAssessment(serviceUserId, { decision, category }),
    onSuccess: (row) => onCreated(row.id),
  });

  return (
    <Modal title="Assess a decision" onClose={onClose}>
      <div className="space-y-4">
        <Labelled
          label="What decision is this about?"
          hint="In plain words, as it would be put to the person: “whether to accept help with washing”, not “personal care”."
        >
          <input
            className="input"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="Whether to…"
          />
        </Labelled>
        <Labelled label="Area">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CAPACITY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Labelled>
        {create.isError && <p className="text-sm text-red-600">{err(create.error)}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary btn"
            disabled={!decision.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Starting…' : 'Start'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- New authority ---------------------------------------------------------

function NewAuthorityModal({
  serviceUserId,
  onClose,
  onCreated,
}: {
  serviceUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<AuthorityPatch>({ kind: 'LPA_HEALTH' });
  const set = <K extends keyof AuthorityPatch>(k: K, v: AuthorityPatch[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => capacityApi.createAuthority(serviceUserId, form),
    onSuccess: onCreated,
  });

  const chosen = AUTHORITY_KINDS.find((a) => a.key === form.kind);

  return (
    <Modal title="Who may decide" onClose={onClose}>
      <div className="space-y-4">
        <Labelled label="Kind" hint={chosen?.hint}>
          <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            {AUTHORITY_KINDS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </Labelled>
        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label={form.kind === 'ADRT' ? 'Where the document is kept' : 'Who holds it'}>
            <input className="input" value={form.holderName || ''} onChange={(e) => set('holderName', e.target.value)} />
          </Labelled>
          <Labelled label="Contact">
            <input className="input" value={form.holderContact || ''} onChange={(e) => set('holderContact', e.target.value)} />
          </Labelled>
        </div>
        <Labelled label="Reference number">
          <input className="input" value={form.reference || ''} onChange={(e) => set('reference', e.target.value)} />
        </Labelled>
        <Labelled label="What it covers" hint="And anything it does not. An LPA for property and affairs says nothing about care.">
          <textarea className="input" rows={3} value={form.scope || ''} onChange={(e) => set('scope', e.target.value)} />
        </Labelled>
        {create.isError && <p className="text-sm text-red-600">{err(create.error)}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- The assessment itself -------------------------------------------------

function AssessmentModal({
  assessment,
  canEdit,
  onClose,
  onChanged,
}: {
  assessment: CapacityAssessment;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<CapacityPatch>({});
  const set = <K extends keyof CapacityPatch>(k: K, v: CapacityPatch[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof CapacityPatch>(k: K, fallback: CapacityPatch[K]): CapacityPatch[K] =>
    k in draft ? draft[k] : fallback;

  const save = useMutation({
    mutationFn: (patch: CapacityPatch) => capacityApi.updateAssessment(assessment.id, patch),
    onSuccess: () => { onChanged(); setDraft({}); },
  });

  const impairment = (val('impairment', assessment.impairment) ?? false) as boolean;
  const lacks = (val('outcome', assessment.outcome) as string | null) === 'LACKS_CAPACITY';

  return (
    <Modal title={assessment.decision} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          {categoryLabel(assessment.category)} · assessed {fmt(assessment.assessedAt)}
          {assessment.assessedBy ? ` by ${assessment.assessedBy.firstName} ${assessment.assessedBy.lastName}` : ''}
        </p>

        {/* Stage 1 */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
            Stage 1 — is there an impairment?
          </p>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={!canEdit}
              checked={impairment}
              onChange={(e) => set('impairment', e.target.checked)}
            />
            <span>
              There is an impairment of, or disturbance in, the functioning of this person’s mind or brain.
              <span className="block text-xs text-gray-500">
                If there is not, they have capacity for this decision and the rest of this form does not apply.
              </span>
            </span>
          </label>
          <textarea
            className="input text-sm"
            rows={2}
            disabled={!canEdit}
            placeholder="What it is, and how you know"
            value={(val('impairmentDetail', assessment.impairmentDetail) ?? '') as string}
            onChange={(e) => set('impairmentDetail', e.target.value)}
          />
        </div>

        {/* Practicable steps */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
            Everything tried to help them decide
          </p>
          <p className="text-xs text-gray-500">
            Nobody is treated as unable to decide until all practicable steps have been tried. This is the
            step most often skipped, so it is required before an outcome of lacking capacity can be saved.
          </p>
          <textarea
            className="input text-sm"
            rows={3}
            disabled={!canEdit}
            placeholder="Simpler words, pictures, an interpreter, a quieter room, a different day, someone they trust present…"
            value={(val('stepsTaken', assessment.stepsTaken) ?? '') as string}
            onChange={(e) => set('stepsTaken', e.target.value)}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Labelled label="Best time of day for them">
              <input
                className="input text-sm"
                disabled={!canEdit}
                value={(val('bestTimeOfDay', assessment.bestTimeOfDay) ?? '') as string}
                onChange={(e) => set('bestTimeOfDay', e.target.value)}
              />
            </Labelled>
            <Labelled label="How it was communicated">
              <input
                className="input text-sm"
                disabled={!canEdit}
                value={(val('communicationUsed', assessment.communicationUsed) ?? '') as string}
                onChange={(e) => set('communicationUsed', e.target.value)}
              />
            </Labelled>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
            Stage 2 — can they, at this moment…
          </p>
          <p className="text-xs text-gray-500">
            Failing any one of these means they cannot make this decision now. An unwise decision is not a
            failure of any of them.
          </p>
          {FUNCTIONAL_TEST.map((t) => {
            const v = val(t.key, assessment[t.key]) as boolean | null | undefined;
            return (
              <div key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm text-gray-800 flex-1 min-w-[220px]">{t.label}</span>
                <div className="flex gap-1 shrink-0">
                  {([true, false] as const).map((opt) => (
                    <button
                      key={String(opt)}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => set(t.key, v === opt ? null : opt)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
                        v === opt
                          ? opt
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-gray-600 border-gray-300'
                      }`}
                    >
                      {opt ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <textarea
            className="input text-sm"
            rows={3}
            disabled={!canEdit}
            placeholder="What they said and did that shows this — in their words where you can"
            value={(val('evidence', assessment.evidence) ?? '') as string}
            onChange={(e) => set('evidence', e.target.value)}
          />
        </div>

        {/* Outcome */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Labelled label="Outcome">
            <select
              className="input"
              disabled={!canEdit}
              value={(val('outcome', assessment.outcome) ?? '') as string}
              onChange={(e) => set('outcome', (e.target.value || null) as CapacityPatch['outcome'])}
            >
              <option value="">Not yet decided</option>
              <option value="HAS_CAPACITY">Has capacity for this decision</option>
              <option value="LACKS_CAPACITY">Lacks capacity for this decision</option>
            </select>
          </Labelled>
          <Labelled label="Review on" hint="Capacity can return, and often does.">
            <input
              type="date"
              className="input"
              disabled={!canEdit}
              value={((val('reviewDate', assessment.reviewDate) as string | null) || '').slice(0, 10)}
              onChange={(e) => set('reviewDate', e.target.value || null)}
            />
          </Labelled>
        </div>

        {/* Best interests */}
        {lacks && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Best interests</p>
            <p className="text-xs text-amber-800">
              Section 4. Not what is safest or easiest — what this person would have chosen, as far as anyone
              can tell.
            </p>
            <Labelled label="What the person wants, and has wanted before">
              <textarea
                className="input text-sm"
                rows={3}
                disabled={!canEdit}
                placeholder="Past and present wishes, feelings, beliefs and values — including anything they said when they could decide"
                value={(val('biPersonsViews', assessment.biPersonsViews) ?? '') as string}
                onChange={(e) => set('biPersonsViews', e.target.value)}
              />
            </Labelled>
            <Labelled label="Who was consulted">
              <textarea
                className="input text-sm"
                rows={2}
                disabled={!canEdit}
                placeholder="Family, attorney or deputy, GP, social worker, advocate — and what each of them said"
                value={(val('biConsulted', assessment.biConsulted) ?? '') as string}
                onChange={(e) => set('biConsulted', e.target.value)}
              />
            </Labelled>
            <Labelled label="What else was considered">
              <textarea
                className="input text-sm"
                rows={2}
                disabled={!canEdit}
                value={(val('biOptions', assessment.biOptions) ?? '') as string}
                onChange={(e) => set('biOptions', e.target.value)}
              />
            </Labelled>
            <Labelled label="Why this is the least restrictive option">
              <textarea
                className="input text-sm"
                rows={2}
                disabled={!canEdit}
                value={(val('biLeastRestrictive', assessment.biLeastRestrictive) ?? '') as string}
                onChange={(e) => set('biLeastRestrictive', e.target.value)}
              />
            </Labelled>
            <Labelled label="The decision">
              <textarea
                className="input text-sm"
                rows={2}
                disabled={!canEdit}
                value={(val('biDecision', assessment.biDecision) ?? '') as string}
                onChange={(e) => set('biDecision', e.target.value)}
              />
            </Labelled>
            {assessment.biDecidedBy && (
              <p className="text-xs text-amber-800">
                Decided {fmt(assessment.biDecidedAt)} by {assessment.biDecidedBy.firstName} {assessment.biDecidedBy.lastName}.
              </p>
            )}

            <div className="border-t border-amber-200 pt-3 space-y-2">
              <label className="flex items-start gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={!canEdit}
                  checked={(val('deprivationConcern', assessment.deprivationConcern) ?? false) as boolean}
                  onChange={(e) => set('deprivationConcern', e.target.checked)}
                />
                <span>
                  This may amount to a deprivation of liberty
                  <span className="block text-xs">
                    Continuous supervision and control, and not free to leave. In someone’s own home that is a
                    Court of Protection matter, not DoLS — it has to be raised with the local authority.
                  </span>
                </span>
              </label>
              {(val('deprivationConcern', assessment.deprivationConcern) ?? false) && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Labelled label="Raised with">
                    <input
                      className="input text-sm"
                      disabled={!canEdit}
                      value={(val('deprivationRaisedWith', assessment.deprivationRaisedWith) ?? '') as string}
                      onChange={(e) => set('deprivationRaisedWith', e.target.value)}
                    />
                  </Labelled>
                  <Labelled label="On">
                    <input
                      type="date"
                      className="input text-sm"
                      disabled={!canEdit}
                      value={((val('deprivationRaisedAt', assessment.deprivationRaisedAt) as string | null) || '').slice(0, 10)}
                      onChange={(e) => set('deprivationRaisedAt', e.target.value || null)}
                    />
                  </Labelled>
                </div>
              )}
            </div>
          </div>
        )}

        {save.isError && <p className="text-sm text-red-600">{err(save.error)}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn" onClick={onClose}>Close</button>
          {canEdit && (
            <button className="btn-primary btn" disabled={save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// --- Shared pieces ---------------------------------------------------------

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
