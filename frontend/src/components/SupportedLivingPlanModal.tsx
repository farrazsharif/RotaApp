import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { riskAssessmentsApi } from '../api/riskAssessments';
import { riskAssessmentVersionsApi } from '../api/riskAssessmentVersions';
import { usePermissions } from '../hooks/usePermissions';
import { ServiceUser } from '../types';
import { format } from 'date-fns';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from '../lib/printBranding';
import { SUPPORT_DOMAINS as SL_DOMAINS } from '../lib/supportDomains';
import HeldOnPaperPanel, { PaperMeta } from './HeldOnPaperPanel';
import RiskAssessmentHistory from './RiskAssessmentHistory';
import AutoGrowTextarea from './AutoGrowTextarea';

// Stored in the generic assessment store, type 'SL_SUPPORT_PLAN' — no backend
// change needed (same as the Contract of Care).
const TYPE = 'SL_SUPPORT_PLAN';

const LEVELS: { v: string; label: string }[] = [
  { v: 'PROMPT', label: 'Prompt only' },
  { v: 'ASSIST', label: 'Assist / support with' },
  { v: 'WITH', label: 'Do together' },
  { v: 'FULL', label: 'Full support' },
];
const levelLabel = (v: string) => LEVELS.find((l) => l.v === v)?.label || '';

interface DomainVal { applies: boolean; level: string; current: string; goal: string; support: string }
const emptyDomain = (): DomainVal => ({ applies: false, level: '', current: '', goal: '', support: '' });

interface PlanData { summary: string; domains: Record<string, DomainVal>; __paper?: PaperMeta }
const emptyPlan = (): PlanData => ({ summary: '', domains: {} });

interface Props { serviceUser: ServiceUser; onClose: () => void }

export default function SupportedLivingPlanModal({ serviceUser, onClose }: Props) {
  const canEdit = usePermissions().can('manage_service_users');
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanData>(emptyPlan());
  const [panel, setPanel] = useState<'none' | 'history'>('none');
  const [reviewLabel, setReviewLabel] = useState('');
  const [editing, setEditing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const suName = `${serviceUser.firstName} ${serviceUser.lastName}`.trim();

  // Fields are read-only unless a manager is actively editing (or renewing).
  const ro = !(canEdit && editing);

  const { data: record, isLoading } = useQuery({
    queryKey: ['sl-plan', serviceUser.id],
    queryFn: () => riskAssessmentsApi.get(serviceUser.id, TYPE),
  });

  // Load the form state from the saved record. Reused on mount and when
  // cancelling an edit (to discard unsaved changes).
  const loadFromRecord = () => {
    if (record?.data) {
      try {
        const parsed = JSON.parse(record.data);
        setPlan({ summary: String(parsed.summary || ''), domains: parsed.domains && typeof parsed.domains === 'object' ? parsed.domains : {}, __paper: parsed.__paper && typeof parsed.__paper === 'object' ? parsed.__paper : undefined });
      } catch { setPlan(emptyPlan()); }
    } else {
      setPlan(emptyPlan());
    }
  };

  useEffect(() => {
    loadFromRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const beginEdit = () => { setRenewing(false); setEditing(true); setPanel('none'); };
  const beginRenew = () => { setRenewing(true); setEditing(true); setPanel('none'); };
  const cancelEdit = () => { setEditing(false); setRenewing(false); loadFromRecord(); };

  const saveMut = useMutation({
    mutationFn: () => riskAssessmentsApi.save(serviceUser.id, TYPE, plan as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sl-plan', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['risk-assessments', serviceUser.id] });
    },
  });

  // Complete review: save the current plan, then freeze an immutable dated
  // snapshot as an archived version. The live plan stays editable.
  const reviewMut = useMutation({
    mutationFn: async () => {
      await riskAssessmentsApi.save(serviceUser.id, TYPE, plan as unknown as Record<string, unknown>);
      return riskAssessmentVersionsApi.create({ serviceUserId: serviceUser.id, type: TYPE, label: reviewLabel.trim() || undefined });
    },
    onSuccess: () => {
      setReviewLabel('');
      qc.invalidateQueries({ queryKey: ['sl-plan', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['risk-assessments', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['risk-assessment-versions', serviceUser.id, TYPE] });
      setEditing(false);
      setRenewing(false);
      setPanel('history');
    },
  });

  const paper = plan.__paper || {};
  const setPaper = (patch: PaperMeta) => setPlan((p) => ({ ...p, __paper: { ...(p.__paper || {}), ...patch } }));

  // Overdue = the held-on-paper next-review date is set and in the past.
  const isOverdue = !!paper.reviewDate && new Date(paper.reviewDate) < new Date();
  const dom = (k: string): DomainVal => plan.domains[k] || emptyDomain();
  const setDom = (k: string, patch: Partial<DomainVal>) =>
    setPlan((p) => ({ ...p, domains: { ...p.domains, [k]: { ...emptyDomain(), ...p.domains[k], ...patch } } }));

  // Build the full support-plan HTML document — shared by Print (a new window)
  // and the modal's inline read-only view. Pass `embed: true` to drop the
  // on-page Print/Close toolbar for inline display; everything else is
  // identical. Values are HTML-escaped here.
  function buildPlanHtml(source: PlanData, embed: boolean): string {
    const domOf = (k: string): DomainVal => source.domains[k] || emptyDomain();
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const blocks = SL_DOMAINS.filter((d) => domOf(d.key).applies).map((d) => {
      const v = domOf(d.key);
      const row = (label: string, val: string) => val ? `<div class="row"><span class="rl">${esc(label)}</span><span class="rv">${esc(val)}</span></div>` : '';
      return `<div class="domain">
        <h3>${esc(d.label)}${v.level ? ` <span class="lvl">${esc(levelLabel(v.level))}</span>` : ''}</h3>
        ${row('Current situation', v.current)}
        ${row('Goal / outcome', v.goal)}
        ${row('How we support', v.support)}
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Supported Living Support Plan — ${esc(suName)}</title>
      <style>
        @page { size: portrait; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 14px; }
        .summary { font-size: 12px; white-space: pre-wrap; margin: 8px 0 16px; }
        .domain { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; page-break-inside: avoid; }
        .domain h3 { font-size: 13px; margin: 0 0 6px; }
        .domain .lvl { font-size: 10px; font-weight: normal; color: #fff; background: #2563eb; border-radius: 10px; padding: 1px 8px; }
        .row { display: flex; gap: 8px; margin-bottom: 3px; }
        .rl { font-size: 10px; font-weight: bold; color: #555; text-transform: uppercase; width: 130px; flex-shrink: 0; }
        .rv { font-size: 12px; white-space: pre-wrap; }
        .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
        .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
        .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
        ${BRANDING_PRINT_CSS}
      </style></head><body>
      ${embed ? '' : `<div class="toolbar no-print"><button onclick="window.print()">🖨 Print</button><button class="secondary" onclick="window.close()">Close</button></div>`}
      ${brandingHeaderHtml()}
      <h1>Supported Living — Support Plan</h1>
      <div class="sub">${esc(suName)} · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}</div>
      ${source.summary ? `<div class="summary">${esc(source.summary)}</div>` : ''}
      ${blocks || '<p style="color:#777">No support areas recorded yet.</p>'}
      </body></html>`;

    return html;
  }

  // Print a plan. Defaults to the live form; the history panel passes a frozen
  // snapshot so a past review prints exactly as it was archived. Opens a window
  // with the on-page toolbar (no auto-print, so View and Print match).
  function printPlan(source: PlanData = plan) {
    const html = buildPlanHtml(source, false);
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.write(html); w.document.close(); w.focus();
  }

  // Read-only VIEW renders the support-plan document (identical to the printout)
  // in a CSS-isolated iframe, built from the live form. Recomputed so the view
  // refreshes after a Save; skipped while editing to avoid rebuilding on keystroke.
  const viewHtml = useMemo(
    () => (editing ? '' : buildPlanHtml(plan, true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, plan, serviceUser],
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">Support Plan — {suName}</h2>
            <p className="text-xs text-gray-500">
              {record ? `Last updated ${format(new Date(record.updatedAt), 'dd MMM yyyy, h:mm a')}` : 'Not started'}
              {!editing && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <HeldOnPaperPanel meta={paper} ro={ro} onChange={setPaper} />

        {isLoading ? (
          <div className="flex-1 flex justify-center items-center"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
        ) : !editing ? (
          // VIEW mode: formatted document (matches the printout), CSS-isolated in an iframe.
          <div className="flex-1 flex flex-col min-h-0 bg-gray-100">
            <iframe title="document preview" srcDoc={viewHtml} className="w-full flex-1 border-0" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Renew banner — shown while archiving a new dated version */}
            {renewing && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p>Renewing this review — make any changes below, then Save to archive the current version as a dated copy.</p>
                <div className="mt-2">
                  <label className="label">Review label (optional)</label>
                  <input value={reviewLabel} onChange={(e) => setReviewLabel(e.target.value)} className="input text-sm" placeholder="e.g. Annual review, 6-month review" />
                </div>
              </div>
            )}
            <div>
              <label className="label">Summary / overview</label>
              {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{plan.summary || <span className="text-gray-400">—</span>}</p> :
                <AutoGrowTextarea value={plan.summary} minRows={2} onChange={(e) => setPlan({ ...plan, summary: e.target.value })} className="input text-sm" placeholder="A short overview of how this person is supported to live independently…" />}
            </div>

            <p className="text-sm font-semibold text-gray-900 pt-1">Support areas</p>
            {SL_DOMAINS.map((d) => {
              const v = dom(d.key);
              return (
                <div key={d.key} className={`rounded-lg border ${v.applies ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200'} p-3`}>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input type="checkbox" disabled={ro} checked={v.applies} onChange={(e) => setDom(d.key, { applies: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                    {d.label}
                  </label>
                  {v.applies && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-gray-500">Level of support</label>
                        {ro ? <p className="text-sm text-gray-800">{levelLabel(v.level) || '—'}</p> : (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {LEVELS.map((l) => (
                              <button key={l.v} type="button" onClick={() => setDom(d.key, { level: v.level === l.v ? '' : l.v })}
                                className={`px-2.5 py-1 rounded-md text-xs border ${v.level === l.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                                {l.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {([['current', 'Current situation'], ['goal', 'Goal / outcome'], ['support', 'How we support']] as [keyof DomainVal, string][]).map(([field, label]) => (
                        <div key={field as string}>
                          <label className="text-xs font-medium text-gray-500">{label}</label>
                          {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{(v[field] as string) || <span className="text-gray-400">—</span>}</p> :
                            <AutoGrowTextarea value={v[field] as string} minRows={2} onChange={(e) => setDom(d.key, { [field]: e.target.value })} className="input text-sm" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Previous reviews panel */}
        {panel === 'history' && (
          <div className="border-t bg-gray-50 px-6 py-4 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Previous reviews</h3>
              <button onClick={() => setPanel('none')} className="text-gray-400 hover:text-gray-600 text-sm">Close ×</button>
            </div>
            <RiskAssessmentHistory
              serviceUserId={serviceUser.id}
              type={TYPE}
              // The plan print window has its own Print/Close toolbar and never
              // auto-prints, so View and Print open the same window.
              onOpen={(data) => printPlan({ ...emptyPlan(), ...(data as Partial<PlanData>) })}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 p-4 border-t">
          {canEdit && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600">Saved ✓</span>}
          {saveMut.isError && <span className="text-sm text-red-600">Save failed</span>}
          {reviewMut.isError && <span className="text-sm text-red-600">Review failed</span>}
          {!editing ? (
            <>
              {/* VIEW mode */}
              <button onClick={() => setPanel((p) => (p === 'history' ? 'none' : 'history'))} className="btn-secondary btn">🕘 Previous reviews</button>
              {canEdit && (
                <>
                  <button onClick={beginEdit} className="btn-secondary btn">✏️ Edit</button>
                  <button
                    onClick={beginRenew}
                    className={isOverdue ? 'btn text-amber-800 border-amber-400 bg-amber-50' : 'btn-secondary btn'}
                  >
                    {isOverdue ? '↻ Renew · due' : '↻ Renew'}
                  </button>
                </>
              )}
              <div className="flex-1" />
              <button onClick={() => printPlan()} className="btn-secondary btn">🖨 Print</button>
              <button onClick={onClose} className="btn-secondary btn">Close</button>
            </>
          ) : (
            <>
              {/* EDIT mode */}
              <button onClick={cancelEdit} className="btn-secondary btn">Cancel</button>
              <div className="flex-1" />
              <button onClick={() => printPlan()} className="btn-secondary btn">🖨 Print</button>
              {renewing ? (
                <button className="btn-primary btn" disabled={reviewMut.isPending} onClick={() => reviewMut.mutate()}>
                  {reviewMut.isPending ? 'Saving review…' : 'Save & archive review'}
                </button>
              ) : (
                <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? 'Saving…' : 'Save'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
