import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cqcApi, CqcCheck, KeyQuestionBlock } from '../api/cqc';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from '../lib/printBranding';
import { format } from 'date-fns';

// The quality statements the system can't auto-check — set manually so the
// readiness picture is complete. Grouped by key question.
const SELF_STATEMENTS: { kq: string; label: string; items: { key: string; label: string }[] }[] = [
  { kq: 'Safe', label: 'Safe', items: [
    { key: 'safe_learning', label: 'Learning culture' },
    { key: 'safe_systems', label: 'Safe systems, pathways and transitions' },
    { key: 'safe_ipc', label: 'Infection prevention and control' },
  ] },
  { kq: 'Effective', label: 'Effective', items: [
    { key: 'eff_evidence', label: 'Delivering evidence-based care and treatment' },
    { key: 'eff_teams', label: 'How staff and teams work together' },
    { key: 'eff_healthier', label: 'Supporting people to live healthier lives' },
  ] },
  { kq: 'Caring', label: 'Caring', items: [
    { key: 'car_dignity', label: 'Kindness, compassion and dignity' },
    { key: 'car_immediate', label: "Responding to people's immediate needs" },
    { key: 'car_workforce', label: 'Workforce wellbeing and enablement' },
  ] },
  { kq: 'Responsive', label: 'Responsive', items: [
    { key: 'res_info', label: 'Providing information' },
    { key: 'res_listening', label: 'Listening to and involving people' },
    { key: 'res_access', label: 'Equity in access' },
    { key: 'res_outcomes', label: 'Equity in experiences and outcomes' },
    { key: 'res_future', label: 'Planning for the future' },
  ] },
  { kq: 'Well-led', label: 'Well-led', items: [
    { key: 'wl_direction', label: 'Shared direction and culture' },
    { key: 'wl_leaders', label: 'Capable, compassionate and inclusive leaders' },
    { key: 'wl_speakup', label: 'Freedom to speak up' },
    { key: 'wl_edi', label: 'Workforce equality, diversity and inclusion' },
    { key: 'wl_partnerships', label: 'Partnerships and communities' },
    { key: 'wl_learning', label: 'Learning, improvement and innovation' },
    { key: 'wl_environment', label: 'Environmental sustainability' },
  ] },
];

const RATINGS: { v: string; label: string; on: string }[] = [
  { v: 'MET', label: 'Met', on: 'bg-green-600 text-white border-green-600' },
  { v: 'PARTIAL', label: 'Partial', on: 'bg-amber-500 text-white border-amber-500' },
  { v: 'NOT_MET', label: 'Not met', on: 'bg-red-600 text-white border-red-600' },
];

const dot = (s: CqcCheck['status']) =>
  s === 'red' ? 'bg-red-500' : s === 'amber' ? 'bg-amber-500' : s === 'green' ? 'bg-green-500' : 'bg-gray-300';
const scoreColour = (n: number) => (n >= 85 ? 'text-green-600' : n >= 60 ? 'text-amber-600' : 'text-red-600');

export default function Cqc() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['cqc-readiness'], queryFn: cqcApi.readiness });
  const [sa, setSa] = useState<Record<string, { rating?: string; note?: string }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { if (data?.selfAssessment) setSa(data.selfAssessment); }, [data]);

  const saveMut = useMutation({
    mutationFn: () => cqcApi.saveSelfAssessment(sa),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cqc-readiness'] }),
  });

  const setRating = (key: string, rating: string) => setSa((p) => ({ ...p, [key]: { ...p[key], rating: p[key]?.rating === rating ? '' : rating } }));
  const setNote = (key: string, note: string) => setSa((p) => ({ ...p, [key]: { ...p[key], note } }));

  function printReport() {
    if (!data) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const flagRows = data.keyQuestions.map((kq) => {
      const flagged = kq.checks.filter((c) => c.status === 'red' || c.status === 'amber');
      if (!flagged.length) return `<tr><td>${esc(kq.label)}</td><td class="ok">No issues</td></tr>`;
      return flagged.map((c) => `<tr><td>${esc(kq.label)}</td><td><span class="${c.status}">${c.status.toUpperCase()}</span> ${esc(c.title)} — ${esc(c.detail)} <span class="qs">(${esc(c.statement)})</span></td></tr>`).join('');
    }).join('');
    const saRows = SELF_STATEMENTS.flatMap((g) => g.items
      .filter((it) => sa[it.key]?.rating && sa[it.key]?.rating !== 'MET')
      .map((it) => `<tr><td>${esc(g.label)}</td><td><span class="${sa[it.key]?.rating === 'NOT_MET' ? 'red' : 'amber'}">${esc(sa[it.key]!.rating!.replace('_', ' '))}</span> ${esc(it.label)}${sa[it.key]?.note ? ` — ${esc(sa[it.key]!.note!)}` : ''}</td></tr>`)).join('');

    const html = `<!DOCTYPE html><html><head><title>CQC Readiness Report</title>
      <style>
        @page { size: portrait; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #555; margin-bottom: 14px; }
        .score { font-size: 34px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
        th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: top; }
        th { background: #f3f3f3; }
        .red { color: #fff; background: #dc2626; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; }
        .amber { color: #fff; background: #d97706; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; }
        .ok { color: #16a34a; }
        .qs { color: #777; font-size: 10px; }
        .toolbar { padding: 8px 0 10px; display: flex; gap: 8px; }
        .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
        @media print { .no-print { display: none !important; } }
        ${BRANDING_PRINT_CSS}
      </style></head><body>
      <div class="toolbar no-print"><button onclick="window.print()">🖨 Print</button><button onclick="window.close()" style="background:#fff;color:#374151;border-color:#d1d5db">Close</button></div>
      ${brandingHeaderHtml()}
      <h1>CQC Readiness Report</h1>
      <div class="sub">Overall readiness <span class="score">${data.overallScore}%</span> · Generated ${esc(format(new Date(data.generatedAt), 'dd MMM yyyy, h:mm a'))}</div>
      <table><thead><tr><th style="width:90px">Score</th><th>Key question</th></tr></thead><tbody>
        ${data.keyQuestions.map((k) => `<tr><td>${k.score}%</td><td>${esc(k.label)}</td></tr>`).join('')}
      </tbody></table>
      <h2>Items to correct (automated checks)</h2>
      <table><thead><tr><th style="width:110px">Key question</th><th>Finding</th></tr></thead><tbody>${flagRows || '<tr><td colspan="2" class="ok">No issues found.</td></tr>'}</tbody></table>
      <h2>Self-assessment gaps</h2>
      <table><thead><tr><th style="width:110px">Key question</th><th>Statement</th></tr></thead><tbody>${saRows || '<tr><td colspan="2" class="ok">Nothing flagged.</td></tr>'}</tbody></table>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.write(html); w.document.close(); w.focus();
  }

  if (isLoading || !data) {
    return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CQC Readiness</h1>
          <p className="text-sm text-gray-500">Automated checks against your records, mapped to the CQC key questions. Fix the flagged items before an inspection.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Overall readiness</p>
            <p className={`text-3xl font-bold ${scoreColour(data.overallScore)}`}>{data.overallScore}%</p>
          </div>
          <button className="btn-secondary btn" onClick={printReport}>🖨 Report</button>
        </div>
      </div>

      {/* Key-question score strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {data.keyQuestions.map((k) => (
          <div key={k.key} className="card text-center py-3">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-xl font-bold ${scoreColour(k.score)}`}>{k.score}%</p>
          </div>
        ))}
      </div>

      {/* Checks per key question */}
      {data.keyQuestions.map((kq: KeyQuestionBlock) => (
        <div key={kq.key} className="card">
          <h2 className="font-semibold text-gray-900 mb-3">{kq.label}</h2>
          <div className="space-y-2">
            {kq.checks.map((c) => (
              <div key={c.id} className="border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${dot(c.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-sm font-medium text-gray-800">{c.title}</p>
                      <span className="text-xs text-gray-400">{c.statement}</span>
                    </div>
                    <p className={`text-sm ${c.status === 'red' ? 'text-red-600' : c.status === 'amber' ? 'text-amber-600' : c.status === 'green' ? 'text-green-600' : 'text-gray-400'}`}>{c.detail}</p>
                    {c.items.length > 0 && (
                      <div className="mt-1">
                        <button className="text-xs text-blue-600 hover:underline" onClick={() => setExpanded((p) => ({ ...p, [c.id]: !p[c.id] }))}>
                          {expanded[c.id] ? 'Hide' : `Show ${c.count > c.items.length ? `${c.items.length} of ${c.count}` : c.count}`}
                        </button>
                        {expanded[c.id] && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {c.items.map((it) => (
                              it.link
                                ? <button key={it.id} onClick={() => navigate(it.link!)} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-blue-700 hover:bg-gray-200">{it.label}</button>
                                : <span key={it.id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{it.label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Manual self-assessment */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Self-assessment</h2>
          <button className="btn-primary btn btn-sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Saving…' : saveMut.isSuccess ? 'Saved ✓' : 'Save'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">The quality statements the system can't measure from data — rate them yourself so the picture is complete.</p>
        <div className="space-y-5">
          {SELF_STATEMENTS.map((g) => (
            <div key={g.kq}>
              <p className="text-sm font-semibold text-gray-700 mb-2">{g.label}</p>
              <div className="space-y-2">
                {g.items.map((it) => (
                  <div key={it.key} className="flex flex-wrap items-center gap-2 border-b last:border-0 pb-2 last:pb-0">
                    <span className="text-sm text-gray-800 flex-1 min-w-[200px]">{it.label}</span>
                    <div className="flex gap-1">
                      {RATINGS.map((r) => (
                        <button key={r.v} onClick={() => setRating(it.key, r.v)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border ${sa[it.key]?.rating === r.v ? r.on : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <input value={sa[it.key]?.note || ''} onChange={(e) => setNote(it.key, e.target.value)} placeholder="Note (optional)" className="input py-1 text-sm w-full sm:w-56" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">Readiness reflects your records — it supports, but doesn't replace, CQC's judgement of people's experience and on-site observation.</p>
    </div>
  );
}
