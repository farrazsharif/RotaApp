import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AssessedStatement, StatementStatus, cqcApi } from '../api/cqc';
import AutoGrowTextarea from './AutoGrowTextarea';

/**
 * The CQC quality statements, assessed from the records Caremid already holds.
 *
 * This replaced a self-assessment questionnaire that ran in parallel with the
 * automated checks and asked a manager to rate statements the data had already
 * answered. Here the data answers what it can, and a manager is asked only
 * where it cannot.
 *
 * The page never resolves a disagreement on anyone's behalf. Where a manager
 * has assessed a statement Met and the checks still fail, both are shown and
 * the divergence is labelled. Marking a statement Met does not clear the
 * records underneath it.
 */

const KQ_ORDER = [
  { key: 'safe', label: 'Safe' },
  { key: 'effective', label: 'Effective' },
  { key: 'caring', label: 'Caring' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'wellled', label: 'Well-led' },
];

const PILL: Record<StatementStatus, string> = {
  MET: 'bg-green-100 text-green-800 border-green-200',
  PARTIALLY_MET: 'bg-amber-100 text-amber-800 border-amber-200',
  NOT_MET: 'bg-red-100 text-red-800 border-red-200',
  INSUFFICIENT_EVIDENCE: 'bg-gray-100 text-gray-600 border-gray-300',
};

const REVIEW_CHOICES = [
  { v: 'MET', label: 'Met', on: 'bg-green-600 text-white border-green-600' },
  { v: 'PARTIALLY_MET', label: 'Partially met', on: 'bg-amber-500 text-white border-amber-500' },
  { v: 'NOT_MET', label: 'Not met', on: 'bg-red-600 text-white border-red-600' },
];
const choiceLabel = (v: string) => REVIEW_CHOICES.find((c) => c.v === v)?.label ?? v;

export default function CqcStatements() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['cqc-statements'], queryFn: cqcApi.statements });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);

  const grouped = useMemo(() => {
    const by = new Map<string, AssessedStatement[]>();
    for (const s of data?.statements ?? []) by.set(s.keyQuestion, [...(by.get(s.keyQuestion) ?? []), s]);
    return by;
  }, [data]);

  if (isLoading || !data) {
    return <div className="card"><div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div></div>;
  }

  const m = data.methodology;
  const needing = data.statements.filter((s) => s.needsReview && !s.review);
  const diverging = data.statements.filter((s) => s.divergent);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Quality statements</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              All {m.totalStatements} CQC quality statements. {m.evidencedByData} are answered by your own records;
              the rest need a person, because no record in Caremid can settle them.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
            Only those needing review
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Tile n={m.evidencedByData} label="Answered by data" tone="text-gray-900" />
          <Tile n={m.awaitingReview} label="Awaiting review" tone={m.awaitingReview ? 'text-amber-600' : 'text-gray-900'} />
          <Tile n={m.reviewedByManager} label="Reviewed by a manager" tone="text-gray-900" />
          <Tile n={m.divergent} label="Manager differs from data" tone={m.divergent ? 'text-red-600' : 'text-gray-900'} />
        </div>

        {needing.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>{needing.length}</strong> statement{needing.length === 1 ? '' : 's'} cannot be assessed from your
            records and need{needing.length === 1 ? 's' : ''} a management review. They are not failures — nothing in
            Caremid can answer them either way.
          </div>
        )}
        {diverging.length > 0 && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>{diverging.length}</strong> statement{diverging.length === 1 ? ' has' : 's have'} a management
            assessment that differs from what the records show. Both are kept; the findings below stand regardless.
          </div>
        )}
      </div>

      {KQ_ORDER.map((kq) => {
        const rows = (grouped.get(kq.key) ?? []).filter((s) => !onlyReview || (s.needsReview && !s.review));
        if (!rows.length) return null;
        return (
          <div key={kq.key} className="card">
            <h3 className="font-semibold text-gray-900 mb-3">{kq.label}</h3>
            <div className="divide-y">
              {rows.map((s) => (
                <Statement
                  key={s.key}
                  s={s}
                  expanded={!!open[s.key]}
                  onToggle={() => setOpen((p) => ({ ...p, [s.key]: !p[s.key] }))}
                  reviewing={reviewing === s.key}
                  onReview={() => setReviewing(reviewing === s.key ? null : s.key)}
                  onSaved={() => { setReviewing(null); qc.invalidateQueries({ queryKey: ['cqc-statements'] }); }}
                  navigate={navigate}
                  evidenceVisible={data.evidenceVisible}
                />
              ))}
            </div>
          </div>
        );
      })}

      <details className="card">
        <summary className="font-semibold text-gray-900 cursor-pointer">How the percentages are worked out</summary>
        <ul className="mt-3 space-y-2 text-sm text-gray-600 list-disc list-inside">
          {m.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
        <p className="text-xs text-gray-400 mt-3">
          Evidence gathered {format(new Date(data.generatedAt), 'd MMM yyyy, HH:mm')}.
        </p>
      </details>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{n}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function Statement({
  s, expanded, onToggle, reviewing, onReview, onSaved, navigate, evidenceVisible,
}: {
  s: AssessedStatement;
  expanded: boolean;
  onToggle: () => void;
  reviewing: boolean;
  onReview: () => void;
  onSaved: () => void;
  navigate: (to: string) => void;
  evidenceVisible: boolean;
}) {
  const [status, setStatus] = useState(s.review?.status ?? '');
  const [rationale, setRationale] = useState('');
  const [evidence, setEvidence] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => cqcApi.reviewStatement(s.key, { status, rationale, evidence: evidence || undefined }),
    onSuccess: onSaved,
    onError: (e: unknown) => setErr(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'That did not save.',
    ),
  });

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <button className="text-sm font-medium text-gray-900 text-left hover:text-blue-700" onClick={onToggle}>
          {s.label}
        </button>
        <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${PILL[s.systemStatus]}`}>
          {s.systemStatusLabel}
        </span>
        {s.review && (
          <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-50 text-blue-800 border-blue-200 whitespace-nowrap">
            Manager: {choiceLabel(s.review.status)}
          </span>
        )}
        {s.divergent && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white whitespace-nowrap">Differs from records</span>
        )}
        <div className="flex-1" />
        <button className="text-xs text-blue-600 hover:underline whitespace-nowrap" onClick={onReview}>
          {s.review ? 'Amend assessment' : 'Record assessment'}
        </button>
      </div>

      <p className="text-sm text-gray-600 mt-1">{s.reason}</p>

      {s.needsReview && s.lookFor && (
        <p className="text-xs text-gray-500 mt-1"><span className="font-medium">Look at:</span> {s.lookFor}</p>
      )}

      {s.evidence.length > 0 && (
        <button className="text-xs text-blue-600 hover:underline mt-1" onClick={onToggle}>
          {expanded ? 'Hide evidence' : `${s.evidence.length} check${s.evidence.length === 1 ? '' : 's'} behind this`}
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-2">
          {s.evidence.map((e) => (
            <div key={e.checkId} className="rounded-lg border border-gray-200 px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${e.status === 'red' ? 'bg-red-500' : e.status === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`} />
                <p className="text-sm font-medium text-gray-800">{e.title}</p>
                <span className="text-xs text-gray-500 tabular-nums">{e.met}/{e.total}</span>
                <span className="text-xs text-gray-400">checked {format(new Date(s.checkedAt), 'd MMM yyyy')}</span>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">{e.detail}</p>
              {e.items.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {e.items.map((it) => (
                    it.link
                      ? <button key={it.id} onClick={() => navigate(it.link!)} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-blue-700 hover:bg-gray-200">{it.label}</button>
                      : <span key={it.id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{it.label}</span>
                  ))}
                </div>
              )}
              {!evidenceVisible && e.total > e.met && (
                <p className="text-xs text-gray-400 mt-1">Named records are not shown with your permissions.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {s.review && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
          <p className="text-gray-800">
            <span className="font-medium">{choiceLabel(s.review.status)}</span> — {s.review.rationale}
          </p>
          {s.review.evidence && <p className="text-gray-600 mt-0.5">Evidence: {s.review.evidence}</p>}
          <p className="text-xs text-gray-500 mt-1">
            {s.review.reviewedBy}, {format(new Date(s.review.reviewedAt), 'd MMM yyyy, HH:mm')}
            {s.history.length > 1 && ` · ${s.history.length} assessments on record`}
          </p>
        </div>
      )}

      {reviewing && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-3">
          {s.systemStatus !== 'INSUFFICIENT_EVIDENCE' && (
            <p className="text-sm text-blue-900">
              The records say <strong>{s.systemStatusLabel.toLowerCase()}</strong>. Your assessment is recorded
              beside that, not instead of it — the findings above stand either way.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_CHOICES.map((c) => (
              <button key={c.v} onClick={() => setStatus(c.v)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${status === c.v ? c.on : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {c.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Why <span className="text-gray-400 font-normal">(required)</span></label>
            <AutoGrowTextarea value={rationale} minRows={2} className="input text-sm"
              placeholder="What you looked at and what it showed." onChange={(e) => setRationale(e.target.value)} />
          </div>
          <div>
            <label className="label">Where the evidence is <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={evidence} onChange={(e) => setEvidence(e.target.value)} className="input text-sm"
              placeholder="A document, a meeting, a survey" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button className="btn-primary btn btn-sm" disabled={!status || !rationale.trim() || save.isPending}
              onClick={() => { setErr(null); save.mutate(); }}>
              {save.isPending ? 'Saving…' : 'Record assessment'}
            </button>
            <button className="btn-secondary btn btn-sm" onClick={onReview}>Cancel</button>
            <span className="text-xs text-gray-500">Kept with your name and the date. Previous assessments are not overwritten.</span>
          </div>
        </div>
      )}
    </div>
  );
}
