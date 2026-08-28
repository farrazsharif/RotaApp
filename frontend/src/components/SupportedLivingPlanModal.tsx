import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { riskAssessmentsApi } from '../api/riskAssessments';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import { format } from 'date-fns';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from '../lib/printBranding';

// Stored in the generic assessment store, type 'SL_SUPPORT_PLAN' — no backend
// change needed (same as the Contract of Care).
const TYPE = 'SL_SUPPORT_PLAN';

// The supported-living support domains (Care 24's list). Add here to extend.
export const SL_DOMAINS: { key: string; label: string }[] = [
  { key: 'budgeting', label: 'Budgeting & money' },
  { key: 'benefits', label: 'Benefits & claims' },
  { key: 'medication', label: 'Medication' },
  { key: 'cooking', label: 'Cooking & meal prep' },
  { key: 'cleaning', label: 'Cleaning & household' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'appointments', label: 'Appointments (managing & attending)' },
  { key: 'social', label: 'Social & community access' },
  { key: 'emotional', label: 'Emotional support' },
  { key: 'mentalHealth', label: 'Mental health' },
  { key: 'behaviour', label: 'Behaviour monitoring' },
  { key: 'deescalation', label: 'De-escalation' },
];

const LEVELS: { v: string; label: string }[] = [
  { v: 'PROMPT', label: 'Prompt only' },
  { v: 'ASSIST', label: 'Assist / support with' },
  { v: 'WITH', label: 'Do together' },
  { v: 'FULL', label: 'Full support' },
];
const levelLabel = (v: string) => LEVELS.find((l) => l.v === v)?.label || '';

interface DomainVal { applies: boolean; level: string; current: string; goal: string; support: string }
const emptyDomain = (): DomainVal => ({ applies: false, level: '', current: '', goal: '', support: '' });

interface PlanData { summary: string; domains: Record<string, DomainVal> }
const emptyPlan = (): PlanData => ({ summary: '', domains: {} });

interface Props { serviceUser: ServiceUser; onClose: () => void }

export default function SupportedLivingPlanModal({ serviceUser, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanData>(emptyPlan());
  const suName = `${serviceUser.firstName} ${serviceUser.lastName}`.trim();

  const { data: record, isLoading } = useQuery({
    queryKey: ['sl-plan', serviceUser.id],
    queryFn: () => riskAssessmentsApi.get(serviceUser.id, TYPE),
  });

  useEffect(() => {
    if (record?.data) {
      try {
        const parsed = JSON.parse(record.data);
        setPlan({ summary: String(parsed.summary || ''), domains: parsed.domains && typeof parsed.domains === 'object' ? parsed.domains : {} });
      } catch { setPlan(emptyPlan()); }
    } else {
      setPlan(emptyPlan());
    }
  }, [record]);

  const saveMut = useMutation({
    mutationFn: () => riskAssessmentsApi.save(serviceUser.id, TYPE, plan as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sl-plan', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['risk-assessments', serviceUser.id] });
    },
  });

  const dom = (k: string): DomainVal => plan.domains[k] || emptyDomain();
  const setDom = (k: string, patch: Partial<DomainVal>) =>
    setPlan((p) => ({ ...p, domains: { ...p.domains, [k]: { ...emptyDomain(), ...p.domains[k], ...patch } } }));

  function printPlan() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const blocks = SL_DOMAINS.filter((d) => dom(d.key).applies).map((d) => {
      const v = dom(d.key);
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
      <div class="toolbar no-print"><button onclick="window.print()">🖨 Print</button><button class="secondary" onclick="window.close()">Close</button></div>
      ${brandingHeaderHtml()}
      <h1>Supported Living — Support Plan</h1>
      <div class="sub">${esc(suName)} · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}</div>
      ${plan.summary ? `<div class="summary">${esc(plan.summary)}</div>` : ''}
      ${blocks || '<p style="color:#777">No support areas recorded yet.</p>'}
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.write(html); w.document.close(); w.focus();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">Support Plan — {suName}</h2>
            <p className="text-xs text-gray-500">
              {record ? `Last updated ${format(new Date(record.updatedAt), 'dd MMM yyyy, h:mm a')}` : 'Not started'}
              {ro && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex justify-center items-center"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="label">Summary / overview</label>
              {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{plan.summary || <span className="text-gray-400">—</span>}</p> :
                <textarea value={plan.summary} rows={2} onChange={(e) => setPlan({ ...plan, summary: e.target.value })} className="input resize-none text-sm" placeholder="A short overview of how this person is supported to live independently…" />}
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
                            <textarea value={v[field] as string} rows={2} onChange={(e) => setDom(d.key, { [field]: e.target.value })} className="input resize-none text-sm" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 p-4 border-t">
          {isManager && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600">Saved ✓</span>}
          {saveMut.isError && <span className="text-sm text-red-600">Save failed</span>}
          <div className="flex-1" />
          <button onClick={printPlan} className="btn-secondary btn">🖨 Print</button>
          <button onClick={onClose} className="btn-secondary btn">Close</button>
          {isManager && (
            <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
