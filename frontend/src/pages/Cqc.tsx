import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cqcApi, CqcCheck, KeyQuestionBlock } from '../api/cqc';
import CqcStatements from '../components/CqcStatements';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from '../lib/printBranding';
import { format } from 'date-fns';
import { viewHtml } from '../lib/printHtml';

const dot = (s: CqcCheck['status']) =>
  s === 'red' ? 'bg-red-500' : s === 'amber' ? 'bg-amber-500' : s === 'green' ? 'bg-green-500' : 'bg-gray-300';
const scoreColour = (n: number) => (n >= 85 ? 'text-green-600' : n >= 60 ? 'text-amber-600' : 'text-red-600');

export default function Cqc() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['cqc-readiness'], queryFn: cqcApi.readiness });
  // Same engine the statements section renders, so the report agrees with it.
  const { data: statements } = useQuery({ queryKey: ['cqc-statements'], queryFn: cqcApi.statements });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function printReport() {
    if (!data) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const flagRows = data.keyQuestions.map((kq) => {
      const flagged = kq.checks.filter((c) => c.status === 'red' || c.status === 'amber');
      if (!flagged.length) return `<tr><td>${esc(kq.label)}</td><td class="ok">No issues</td></tr>`;
      return flagged.map((c) => `<tr><td>${esc(kq.label)}</td><td><span class="${c.status}">${c.status.toUpperCase()}</span> ${esc(c.title)} — ${esc(c.detail)} <span class="qs">(${esc(c.statement)})</span></td></tr>`).join('');
    }).join('');
    // Statements come from the SAME engine the page renders, so the report
    // cannot show a status the screen disagrees with.
    const pill = (st: string) => (st === 'NOT_MET' ? 'red' : st === 'PARTIALLY_MET' ? 'amber' : st === 'MET' ? 'ok' : 'qs');
    const stRows = (statements?.statements ?? [])
      .filter((x) => x.systemStatus !== 'MET' || x.review || x.divergent)
      .map((x) => `<tr><td>${esc(x.label)}</td>`
        + `<td><span class="${pill(x.systemStatus)}">${esc(x.systemStatusLabel)}</span> ${esc(x.reason)}`
        + (x.review ? ` <em>Manager: ${esc(x.review.status.replace('_', ' ').toLowerCase())} — ${esc(x.review.rationale)} (${esc(x.review.reviewedBy)}, ${esc(format(new Date(x.review.reviewedAt), 'dd MMM yyyy'))})</em>` : '')
        + (x.divergent ? ' <span class="red">DIFFERS FROM RECORDS</span>' : '')
        + '</td></tr>').join('');
    const methodRows = (statements?.methodology.notes ?? []).map((n) => `<li>${esc(n)}</li>`).join('');

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
      <h2>Quality statements</h2>
      <table><thead><tr><th style="width:170px">Statement</th><th>Assessment</th></tr></thead><tbody>${stRows || '<tr><td colspan="2" class="ok">Every statement met.</td></tr>'}</tbody></table>
      <h2>How these figures are worked out</h2>
      <ul>${methodRows}</ul>
      </body></html>`;

    viewHtml(html, 'CQC');
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

      <CqcStatements />

      <p className="text-xs text-gray-400">Readiness reflects your records — it supports, but doesn't replace, CQC's judgement of people's experience and on-site observation.</p>
    </div>
  );
}
