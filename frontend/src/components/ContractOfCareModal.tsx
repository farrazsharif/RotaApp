import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { riskAssessmentsApi } from '../api/riskAssessments';
import { carePlansApi } from '../api/carePlans';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import { format } from 'date-fns';
import SignaturePad from './SignaturePad';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from '../lib/printBranding';

// Stored under the generic assessment store, type 'CONTRACT_OF_CARE'. The weekly
// visits (and the hours total) are read live from the client's Care Plan Weekly
// Visit Profile — so the contract always matches the current care plan.
const TYPE = 'CONTRACT_OF_CARE';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'tea', label: 'Tea' },
  { key: 'bed', label: 'Bed' },
] as const;

type Schedule = Record<string, Record<string, string>>;

// Parse a visit time range like "9.30-10.00am", "8.00-8.45am", "2–3pm" into a
// duration in minutes. Tolerant of ., :, am/pm on either end, en/em dashes.
// Returns 0 if it can't be parsed (the cell still shows the raw text).
function parseMinutes(range: string): number {
  if (!range) return 0;
  const s = range.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
  const parts = s.split('-');
  if (parts.length < 2) return 0;
  const tok = (raw: string): { h: number; m: number; mer: 'am' | 'pm' | null } | null => {
    let t = raw;
    let mer: 'am' | 'pm' | null = null;
    if (t.endsWith('am')) { mer = 'am'; t = t.slice(0, -2); }
    else if (t.endsWith('pm')) { mer = 'pm'; t = t.slice(0, -2); }
    t = t.replace(':', '.');
    if (!t) return null;
    const seg = t.split('.');
    const h = parseInt(seg[0], 10);
    if (isNaN(h)) return null;
    const m = seg[1] ? parseInt(seg[1].padEnd(2, '0').slice(0, 2), 10) : 0;
    return { h, m: isNaN(m) ? 0 : m, mer };
  };
  const a = tok(parts[0]);
  const b = tok(parts[1]);
  if (!a || !b) return 0;
  if (!a.mer && b.mer) a.mer = b.mer; // "9.30-10.00am" → start is am too
  const to24 = (x: { h: number; m: number; mer: 'am' | 'pm' | null }) => {
    let h = x.mer ? x.h % 12 : x.h;
    if (x.mer === 'pm') h += 12;
    if (x.mer === 'am' && x.h === 12) h = 0;
    return h * 60 + x.m;
  };
  let diff = to24(b) - to24(a);
  if (diff <= 0) diff += 720; // crosses the 12h boundary (e.g. 11.30-12.15pm)
  return diff > 0 && diff < 720 ? diff : Math.max(0, diff);
}

interface ContractData {
  staffing: 'single' | 'double';
  serviceUserSig: string;
  managerName: string;
  managerSig: string;
  signedDate: string;
  medAuth: boolean;
  medServiceUserSig: string;
  medManagerSig: string;
  medDate: string;
}

const emptyData = (): ContractData => ({
  staffing: 'single', serviceUserSig: '', managerName: '', managerSig: '', signedDate: '',
  medAuth: false, medServiceUserSig: '', medManagerSig: '', medDate: '',
});

interface Props {
  serviceUser: ServiceUser;
  onClose: () => void;
}

export default function ContractOfCareModal({ serviceUser, onClose }: Props) {
  const { user, isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [d, setD] = useState<ContractData>(emptyData());

  const suName = `${serviceUser.firstName} ${serviceUser.lastName}`.trim();
  const currentUserName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';

  const { data: record, isLoading } = useQuery({
    queryKey: ['contract-of-care', serviceUser.id],
    queryFn: () => riskAssessmentsApi.get(serviceUser.id, TYPE),
  });

  // Weekly visits come from the Care Plan.
  const { data: carePlan } = useQuery({
    queryKey: ['care-plan', serviceUser.id],
    queryFn: () => carePlansApi.get(serviceUser.id),
  });

  const schedule: Schedule = useMemo(() => {
    try { return carePlan?.schedule ? JSON.parse(carePlan.schedule) : {}; } catch { return {}; }
  }, [carePlan]);

  const { totalMins, visitCount, hasAnyVisit } = useMemo(() => {
    let mins = 0, count = 0, any = false;
    for (const day of DAYS) for (const s of SLOTS) {
      const t = schedule[day]?.[s.key]?.trim();
      if (t) { any = true; count += 1; mins += parseMinutes(t); }
    }
    return { totalMins: mins, visitCount: count, hasAnyVisit: any };
  }, [schedule]);

  // Double-up = two carers on each visit, so the total care hours delivered are
  // doubled. Single = the visit hours as-is.
  const staffMultiplier = d.staffing === 'double' ? 2 : 1;
  const totalHours = (totalMins * staffMultiplier) / 60;
  const hoursLabel = Number.isInteger(totalHours) ? String(totalHours) : totalHours.toFixed(2);

  useEffect(() => {
    if (record?.data) {
      try {
        const parsed = JSON.parse(record.data);
        setD({ ...emptyData(), ...parsed });
      } catch { setD(emptyData()); }
    } else {
      setD({ ...emptyData(), managerName: currentUserName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const saveMut = useMutation({
    mutationFn: () => riskAssessmentsApi.save(serviceUser.id, TYPE, d as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-of-care', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['risk-assessments', serviceUser.id] });
    },
  });

  function printContract() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const rows = DAYS.map((day) => {
      const cells = SLOTS.map((s) => {
        const t = schedule[day]?.[s.key]?.trim() || '';
        return `<td class="cell">${t ? esc(t) : ''}</td>`;
      }).join('');
      return `<tr><th class="day">${esc(day)}</th>${cells}</tr>`;
    }).join('');

    const sig = (label: string, img: string, sub: string) =>
      `<div class="sigbox"><div class="sig-label">${esc(label)}</div>${img ? `<img class="sig" src="${img}" />` : '<div class="sig-empty"></div>'}<div class="sig-sub">${esc(sub)}</div></div>`;

    const html = `<!DOCTYPE html><html><head><title>Contract of Care — ${esc(suName)}</title>
      <style>
        @page { size: portrait; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
        .statement { font-size: 13px; line-height: 1.6; margin: 12px 0 18px; }
        .statement b { border-bottom: 1px solid #111; padding: 0 4px; }
        table.coc { width: 100%; border-collapse: collapse; margin: 8px 0 6px; }
        table.coc th, table.coc td { border: 1px solid #999; padding: 6px 8px; text-align: center; font-size: 11px; }
        table.coc thead th { background: #f3f3f3; }
        table.coc .day { text-align: left; background: #fafafa; width: 120px; }
        table.coc .cell { height: 26px; }
        .totals { font-size: 13px; margin: 8px 0 20px; }
        .totals b { font-size: 15px; }
        .sigrow { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 10px; }
        .sig-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #555; letter-spacing: 0.02em; }
        .sig { max-height: 60px; max-width: 100%; display: block; margin-top: 4px; }
        .sig-empty { height: 46px; border-bottom: 1px solid #111; margin-top: 4px; }
        .sig-sub { font-size: 11px; color: #333; margin-top: 4px; }
        h2 { font-size: 14px; margin: 24px 0 6px; background: #f3f3f3; padding: 5px 8px; }
        .med-line { font-size: 13px; margin: 8px 0 12px; }
        .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
        .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
        .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
        @media print { body { margin: 0; } .no-print { display: none !important; } }
        ${BRANDING_PRINT_CSS}
      </style></head><body>
      <div class="toolbar no-print">
        <button onclick="window.print()">🖨 Print</button>
        <button class="secondary" onclick="window.close()">Close</button>
      </div>
      ${brandingHeaderHtml()}
      <h1>Contract of Care</h1>
      <div class="sub">${esc(suName)} · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}</div>
      <p class="statement">I, <b>${esc(suName)}</b>, have agreed to the terms and conditions outlined in this contract of care. I will be receiving <b>${esc(hoursLabel)}</b> hours of care per week from <b>${esc(d.staffing === 'double' ? 'double-up (2 carers)' : 'single')}</b> staff.</p>
      <table class="coc">
        <thead><tr><th></th>${SLOTS.map((s) => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">Total visits per week: <b>${visitCount}</b> · Total: <b>${esc(hoursLabel)} hours</b> per week</div>
      <div class="sigrow">
        ${sig('Service User Signature', d.serviceUserSig, esc(suName))}
        ${sig("Manager's Signature", d.managerSig, esc(d.managerName || ''))}
        ${sig('Date', '', d.signedDate ? esc(format(new Date(d.signedDate), 'dd MMM yyyy')) : '')}
      </div>
      <h2>Medication Administration Contract</h2>
      <p class="med-line">I authorise the provider to administer my medication — <b>${d.medAuth ? 'Yes' : 'Not applicable'}</b> <span style="color:#777">(sign if applicable)</span></p>
      <div class="sigrow">
        ${sig('Service User Signature', d.medServiceUserSig, esc(suName))}
        ${sig("Manager's Signature", d.medManagerSig, esc(d.managerName || ''))}
        ${sig('Date', '', d.medDate ? esc(format(new Date(d.medDate), 'dd MMM yyyy')) : '')}
      </div>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">Contract of Care — {suName}</h2>
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
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Statement */}
            <p className="text-sm text-gray-800 leading-relaxed">
              I, <span className="font-semibold underline">{suName}</span>, have agreed to the terms and conditions outlined in this contract of care.
              I will be receiving <span className="font-semibold underline">{hoursLabel}</span> hours of care per week from{' '}
              {ro ? (
                <span className="font-semibold underline">{d.staffing === 'double' ? 'double-up (2 carers)' : 'single'}</span>
              ) : (
                <select className="input inline-block w-auto py-0.5 text-sm align-baseline" value={d.staffing} onChange={(e) => setD({ ...d, staffing: e.target.value as 'single' | 'double' })}>
                  <option value="single">single</option>
                  <option value="double">double-up (2 carers)</option>
                </select>
              )}{' '}staff.
            </p>

            {/* Weekly visits — pulled from the Care Plan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Weekly visits <span className="font-normal text-gray-400">— from the Care Plan</span></h3>
                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Total</span> <span className="font-bold text-blue-700">{hoursLabel} hrs/week</span>
                  <span className="text-gray-400"> · {visitCount} visit{visitCount === 1 ? '' : 's'}</span>
                </div>
              </div>
              {!hasAnyVisit ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  No weekly visits on the Care Plan yet. Add the visit times to this client's <span className="font-medium">Care Plan → Weekly Visit Profile</span> and they'll appear here automatically.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border p-2 bg-gray-50 text-left w-28"></th>
                        {SLOTS.map((s) => <th key={s.key} className="border p-2 bg-gray-50 font-medium">{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day) => (
                        <tr key={day}>
                          <th className="border p-2 bg-gray-50 text-left font-medium text-gray-700">{day}</th>
                          {SLOTS.map((s) => {
                            const t = schedule[day]?.[s.key]?.trim() || '';
                            return (
                              <td key={s.key} className={`border p-2 text-center ${t ? 'bg-blue-50 text-gray-800' : 'text-gray-300'}`}>
                                {t || '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Times and hours are taken from the Care Plan — edit them there and they update here.</p>
            </div>

            {/* Signatures */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Signatures</h3>
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label className="label">Service User Signature</label>
                  <SignaturePad value={d.serviceUserSig} ro={ro} onChange={(v) => setD({ ...d, serviceUserSig: v })} />
                  <p className="text-xs text-gray-500 mt-1">{suName}</p>
                </div>
                <div>
                  <label className="label">Manager's Signature</label>
                  <SignaturePad value={d.managerSig} ro={ro} onChange={(v) => setD({ ...d, managerSig: v })} />
                  {ro ? (
                    <p className="text-xs text-gray-500 mt-1">{d.managerName || '—'}</p>
                  ) : (
                    <input value={d.managerName} onChange={(e) => setD({ ...d, managerName: e.target.value })} placeholder="Manager name" className="input mt-1 text-sm" />
                  )}
                </div>
                <div>
                  <label className="label">Date</label>
                  {ro ? (
                    <p className="text-sm text-gray-800">{d.signedDate ? format(new Date(d.signedDate), 'dd MMM yyyy') : '—'}</p>
                  ) : (
                    <input type="date" value={d.signedDate} onChange={(e) => setD({ ...d, signedDate: e.target.value })} className="input text-sm" />
                  )}
                </div>
              </div>
            </div>

            {/* Medication authorisation */}
            <div className="border-t pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Medication Administration Contract</h3>
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-800">
                <input type="checkbox" disabled={ro} checked={d.medAuth} onChange={(e) => setD({ ...d, medAuth: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                I authorise the provider to administer my medication <span className="text-gray-400">(sign if applicable)</span>
              </label>
              {d.medAuth && (
                <div className="grid gap-5 sm:grid-cols-3 mt-4">
                  <div>
                    <label className="label">Service User Signature</label>
                    <SignaturePad value={d.medServiceUserSig} ro={ro} onChange={(v) => setD({ ...d, medServiceUserSig: v })} />
                  </div>
                  <div>
                    <label className="label">Manager's Signature</label>
                    <SignaturePad value={d.medManagerSig} ro={ro} onChange={(v) => setD({ ...d, medManagerSig: v })} />
                  </div>
                  <div>
                    <label className="label">Date</label>
                    {ro ? (
                      <p className="text-sm text-gray-800">{d.medDate ? format(new Date(d.medDate), 'dd MMM yyyy') : '—'}</p>
                    ) : (
                      <input type="date" value={d.medDate} onChange={(e) => setD({ ...d, medDate: e.target.value })} className="input text-sm" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 p-4 border-t">
          {isManager && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600">Saved ✓</span>}
          {saveMut.isError && <span className="text-sm text-red-600">Save failed</span>}
          <div className="flex-1" />
          <button onClick={printContract} className="btn-secondary btn">🖨 Print</button>
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
