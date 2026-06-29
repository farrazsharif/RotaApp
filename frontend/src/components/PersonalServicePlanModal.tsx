import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicePlansApi } from '../api/servicePlans';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import { PSP_SECTIONS, itemKey, PspItem, PspSection } from '../lib/servicePlanSchema';
import { format } from 'date-fns';

interface Props {
  serviceUser: ServiceUser;
  onClose: () => void;
}

type YnVal = { v: '' | 'YES' | 'NO'; comment: string; action?: string };
type CheckVal = { checked: boolean; comment: string };
type CapVal = { independent: boolean; supervise: boolean; staff: string; aid: string };
type SigVal = { dataUrl: string; name: string; date: string };
type MhEquipVal = {
  turnplate: boolean; slideSheet: boolean; handlingBelt: boolean; rotunder: boolean; other: boolean;
  hoistModel: string; bathHoistModel: string; standAidModel: string; otherDetail: string;
};
type EquipVal = {
  suppliedBy: string; servicingBy: string; contractorNumber: string;
  make: string; model: string; serviceNo: string; lastService: string; nextDue: string;
};

export default function PersonalServicePlanModal({ serviceUser, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [activeSection, setActiveSection] = useState(PSP_SECTIONS[0].id);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['service-plan', serviceUser.id],
    queryFn: () => servicePlansApi.get(serviceUser.id),
  });

  useEffect(() => {
    if (plan?.data) {
      try { setValues(JSON.parse(plan.data)); } catch { setValues({}); }
    } else {
      setValues({});
    }
  }, [plan]);

  const saveMut = useMutation({
    mutationFn: () => servicePlansApi.save(serviceUser.id, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-plan', serviceUser.id] }),
  });

  const set = (key: string, val: unknown) => setValues((v) => ({ ...v, [key]: val }));

  const yn = (key: string): YnVal => (values[key] as YnVal) || { v: '', comment: '', action: '' };
  const chk = (key: string): CheckVal => (values[key] as CheckVal) || { checked: false, comment: '' };
  const cap = (key: string): CapVal => (values[key] as CapVal) || { independent: false, supervise: false, staff: '', aid: '' };
  const str = (key: string): string => (values[key] as string) || '';
  const sig = (key: string): SigVal => (values[key] as SigVal) || { dataUrl: '', name: '', date: '' };
  const mhe = (key: string): MhEquipVal => (values[key] as MhEquipVal) ||
    { turnplate: false, slideSheet: false, handlingBelt: false, rotunder: false, other: false, hoistModel: '', bathHoistModel: '', standAidModel: '', otherDetail: '' };
  const eqp = (key: string): EquipVal => (values[key] as EquipVal) ||
    { suppliedBy: '', servicingBy: '', contractorNumber: '', make: '', model: '', serviceNo: '', lastService: '', nextDue: '' };

  // progress: how many sections have at least one answered item
  const completed = useMemo(() => {
    return PSP_SECTIONS.filter((s) =>
      s.items.some((_, i) => {
        const v = values[itemKey(s.id, i)];
        if (!v) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some((x) => x === true || (typeof x === 'string' && x.trim() !== ''));
        return false;
      })
    ).length;
  }, [values]);

  function printPlan() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

    function itemHtml(section: PspSection, item: PspItem, idx: number): string {
      const key = itemKey(section.id, idx);
      const type = item.type || 'yn';

      if (type === 'yn') {
        const v = yn(key);
        return `<div class="item">
          <div class="item-row"><span>${esc(item.label)}</span><b class="${v.v === 'YES' ? 'yes' : v.v === 'NO' ? 'no' : 'blank'}">${v.v || '—'}</b></div>
          ${v.comment ? `<div class="note">Comment: ${esc(v.comment)}</div>` : ''}
          ${section.action && v.action ? `<div class="note">Action: ${esc(v.action)}</div>` : ''}
        </div>`;
      }
      if (type === 'check') {
        const v = chk(key);
        return `<div class="item">
          <div class="item-row"><span>${v.checked ? '☑' : '☐'} ${esc(item.label)}</span></div>
          ${v.comment ? `<div class="note">Comment: ${esc(v.comment)}</div>` : ''}
        </div>`;
      }
      if (type === 'choice') {
        const v = str(key);
        return `<div class="item"><div class="item-row"><span>${esc(item.label)}</span><b>${esc(v || '—')}</b></div></div>`;
      }
      if (type === 'capability') {
        const v = cap(key);
        const parts = [v.independent && 'Independent', v.supervise && 'Supervise', v.staff && `Staff: ${v.staff}`, v.aid && `Aid: ${v.aid}`].filter(Boolean);
        return `<div class="item"><div class="item-row"><span>${esc(item.label)}</span><span>${esc(parts.join(' · ') || '—')}</span></div></div>`;
      }
      if (type === 'signature') {
        const v = sig(key);
        return `<div class="item">
          <div class="note">${esc(item.label)}</div>
          ${v.dataUrl ? `<img class="sig" src="${v.dataUrl}" />` : '<div class="note">Not signed</div>'}
          <div class="note">${[v.name, v.date].filter(Boolean).map(esc).join(' · ')}</div>
        </div>`;
      }
      if (type === 'mhEquipment') {
        const v = mhe(key);
        const checked = ([['turnplate', 'Turnplate'], ['slideSheet', 'Slide Sheet'], ['handlingBelt', 'Handling Belt'], ['rotunder', 'Rotunder'], ['other', 'Other']] as const)
          .filter(([k]) => v[k]).map(([, label]) => label);
        const texts = ([['hoistModel', 'Hoist'], ['bathHoistModel', 'Bath Hoist'], ['standAidModel', 'Stand Aid'], ['otherDetail', 'Other']] as const)
          .filter(([k]) => v[k]).map(([k, label]) => `${label}: ${v[k]}`);
        return `<div class="item"><div class="item-row"><span>${esc([...checked, ...texts].join(' · ') || '—')}</span></div></div>`;
      }
      if (type === 'equipment') {
        const v = eqp(key);
        const parts = [v.suppliedBy && `Supplied: ${v.suppliedBy}`, v.servicingBy && `Servicing: ${v.servicingBy}`, v.make && `Make: ${v.make}`, v.model && `Model: ${v.model}`, v.serviceNo && `Service no: ${v.serviceNo}`, v.lastService && `Last service: ${v.lastService}`, v.nextDue && `Next due: ${v.nextDue}`, v.contractorNumber && `Contractor: ${v.contractorNumber}`].filter(Boolean);
        return `<div class="item"><div class="note">${esc(item.label)}</div><div class="item-row"><span>${esc(parts.join(' · ') || '—')}</span></div></div>`;
      }
      // text / longtext
      const v = str(key);
      return `<div class="item"><div class="note">${esc(item.label)}</div><div class="item-row"><span>${esc(v || '—')}</span></div></div>`;
    }

    const sectionsHtml = PSP_SECTIONS.map((s) => `
      <div class="section">
        <h2>${esc(s.title)}</h2>
        ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ''}
        ${s.note ? `<p class="note-box">${esc(s.note)}</p>` : ''}
        ${s.items.map((item, i) => itemHtml(s, item, i)).join('')}
      </div>
    `).join('');

    const html = `<!DOCTYPE html><html><head><title>Personal Service Plan — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
      <style>
        @page { size: portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
        .section { page-break-inside: avoid; margin-bottom: 14px; }
        h2 { font-size: 14px; margin: 0 0 6px; background: #f3f3f3; padding: 5px 8px; }
        .intro { font-size: 11px; color: #555; margin: 0 0 6px; }
        .note-box { font-size: 10px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; padding: 6px; margin: 0 0 6px; }
        .item { border-bottom: 1px solid #eee; padding: 4px 0; }
        .item-row { display: flex; justify-content: space-between; gap: 10px; }
        .item-row b.yes { color: #15803d; }
        .item-row b.no { color: #b91c1c; }
        .item-row b.blank { color: #999; }
        .note { font-size: 10px; color: #666; margin-top: 2px; }
        .sig { max-height: 50px; border: 1px solid #ccc; margin: 4px 0; }
        @media print { body { margin: 0; } .section { page-break-inside: auto; } }
      </style></head><body>
      <h1>Personal Service Plan</h1>
      <div class="sub">
        ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}
        ${serviceUser.dateOfBirth ? ` · DOB ${esc(format(new Date(serviceUser.dateOfBirth), 'dd MMM yyyy'))}` : ''}
        ${serviceUser.nhsNumber ? ` · NHS ${esc(serviceUser.nhsNumber)}` : ''}
        · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}
      </div>
      ${sectionsHtml}
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function renderItem(section: PspSection, item: PspItem, idx: number) {
    const key = itemKey(section.id, idx);
    const type = item.type || 'yn';

    if (type === 'yn') {
      const val = yn(key);
      return (
        <div key={key} className="py-2 border-b last:border-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm text-gray-800 flex-1 min-w-[200px]">{item.label}</span>
            {ro ? (
              <span className={`text-sm font-medium ${val.v === 'YES' ? 'text-green-700' : val.v === 'NO' ? 'text-red-600' : 'text-gray-400'}`}>{val.v || '—'}</span>
            ) : (
              <div className="flex gap-1">
                {(['YES', 'NO'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(key, { ...val, v: val.v === opt ? '' : opt })}
                    className={`px-3 py-1 rounded-md text-xs font-medium border ${
                      val.v === opt
                        ? opt === 'YES' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`grid gap-2 mt-1 ${section.action ? 'sm:grid-cols-2' : ''}`}>
            <CommentField label="Comment" value={val.comment} ro={ro} onChange={(c) => set(key, { ...val, comment: c })} />
            {section.action && (
              <CommentField label="Action" value={val.action || ''} ro={ro} onChange={(a) => set(key, { ...val, action: a })} />
            )}
          </div>
        </div>
      );
    }

    if (type === 'check') {
      const val = chk(key);
      return (
        <div key={key} className="py-2 border-b last:border-0 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-800 flex-1 min-w-[200px]">
            <input type="checkbox" checked={val.checked} disabled={ro} onChange={(e) => set(key, { ...val, checked: e.target.checked })} />
            {item.label}
          </label>
          <CommentField label="Comment" value={val.comment} ro={ro} onChange={(c) => set(key, { ...val, comment: c })} />
        </div>
      );
    }

    if (type === 'choice') {
      const val = str(key);
      return (
        <div key={key} className="py-2 border-b last:border-0">
          <p className="text-sm text-gray-800 mb-1">{item.label}</p>
          {ro ? (
            <span className="text-sm font-medium text-gray-700">{val || '—'}</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {item.options!.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set(key, val === opt ? '' : opt)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    val === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (type === 'capability') {
      const val = cap(key);
      return (
        <div key={key} className="py-2 border-b last:border-0 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-gray-800 w-40">{item.label}</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={val.independent} disabled={ro} onChange={(e) => set(key, { ...val, independent: e.target.checked })} /> Independent
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={val.supervise} disabled={ro} onChange={(e) => set(key, { ...val, supervise: e.target.checked })} /> Supervise
          </label>
          <input
            value={val.staff} disabled={ro} onChange={(e) => set(key, { ...val, staff: e.target.value })}
            placeholder="No. staff" className="input py-1 text-sm w-24"
          />
          <input
            value={val.aid} disabled={ro} onChange={(e) => set(key, { ...val, aid: e.target.value })}
            placeholder="Aid / appliance" className="input py-1 text-sm flex-1 min-w-[140px]"
          />
        </div>
      );
    }

    if (type === 'signature') {
      const val = sig(key);
      return (
        <div key={key} className="py-3 border-b last:border-0">
          <p className="text-sm text-gray-800 mb-2">{item.label}</p>
          <SignaturePad
            value={val.dataUrl}
            ro={ro}
            onChange={(dataUrl) => set(key, { ...val, dataUrl })}
          />
          <div className="grid grid-cols-2 gap-3 mt-2">
            {ro ? (
              <>
                <p className="text-xs text-gray-500"><span className="font-medium">Name:</span> {val.name || '—'}</p>
                <p className="text-xs text-gray-500"><span className="font-medium">Date:</span> {val.date || '—'}</p>
              </>
            ) : (
              <>
                <input value={val.name} onChange={(e) => set(key, { ...val, name: e.target.value })} placeholder="Print name" className="input py-1 text-sm" />
                <input type="date" value={val.date} onChange={(e) => set(key, { ...val, date: e.target.value })} className="input py-1 text-sm" />
              </>
            )}
          </div>
        </div>
      );
    }

    if (type === 'mhEquipment') {
      const val = mhe(key);
      const checks: { k: keyof MhEquipVal; label: string }[] = [
        { k: 'turnplate', label: 'Turnplate' }, { k: 'slideSheet', label: 'Slide Sheet' },
        { k: 'handlingBelt', label: 'Handling Belt' }, { k: 'rotunder', label: 'Rotunder' },
        { k: 'other', label: 'Other' },
      ];
      const texts: { k: keyof MhEquipVal; label: string }[] = [
        { k: 'hoistModel', label: 'Hoist (include model)' },
        { k: 'bathHoistModel', label: 'Bath Hoist (include model)' },
        { k: 'standAidModel', label: 'Stand Aid (include model)' },
        { k: 'otherDetail', label: 'Other (please specify)' },
      ];
      return (
        <div key={key} className="py-2 space-y-3">
          <div className="flex flex-wrap gap-4">
            {checks.map(({ k, label }) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={val[k] as boolean} disabled={ro} onChange={(e) => set(key, { ...val, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {texts.map(({ k, label }) => (
              <div key={k}>
                <label className="label">{label}</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{(val[k] as string) || <span className="text-gray-400">—</span>}</p>
                ) : (
                  <input value={val[k] as string} onChange={(e) => set(key, { ...val, [k]: e.target.value })} className="input text-sm" />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === 'equipment') {
      const val = eqp(key);
      const fields: { k: keyof EquipVal; label: string }[] = [
        { k: 'make', label: 'Make' }, { k: 'model', label: 'Model' }, { k: 'serviceNo', label: 'Service no.' },
        { k: 'lastService', label: 'Last date of service' }, { k: 'nextDue', label: 'Next date due' },
        { k: 'contractorNumber', label: 'Contractor (include number)' },
      ];
      return (
        <div key={key} className="py-3 border rounded-lg p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-800">{item.label}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Supplied by</label>
              {ro ? <p className="text-sm text-gray-800">{val.suppliedBy || '—'}</p> :
                <input value={val.suppliedBy} onChange={(e) => set(key, { ...val, suppliedBy: e.target.value })} placeholder="Service User / Social Services / Other" className="input text-sm" />}
            </div>
            <div>
              <label className="label">Responsibility for servicing</label>
              {ro ? <p className="text-sm text-gray-800">{val.servicingBy || '—'}</p> :
                <input value={val.servicingBy} onChange={(e) => set(key, { ...val, servicingBy: e.target.value })} placeholder="Service User / Social Services / Contractor" className="input text-sm" />}
            </div>
            {fields.map(({ k, label }) => (
              <div key={k}>
                <label className="label">{label}</label>
                {ro ? <p className="text-sm text-gray-800">{(val[k] as string) || <span className="text-gray-400">—</span>}</p> :
                  <input value={val[k] as string} onChange={(e) => set(key, { ...val, [k]: e.target.value })} className="input text-sm" />}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // text / longtext
    const val = str(key);
    return (
      <div key={key} className="py-2 border-b last:border-0">
        <label className="label">{item.label}</label>
        {ro ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{val || <span className="text-gray-400">—</span>}</p>
        ) : type === 'longtext' ? (
          <textarea value={val} rows={3} onChange={(e) => set(key, e.target.value)} className="input resize-none text-sm" />
        ) : (
          <input value={val} onChange={(e) => set(key, e.target.value)} className="input text-sm" />
        )}
      </div>
    );
  }

  const current = PSP_SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">Personal Service Plan — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">
              {plan ? `Last updated ${format(new Date(plan.updatedAt), 'dd MMM yyyy, h:mm a')}` : 'Not started'}
              {` · ${completed}/${PSP_SECTIONS.length} sections started`}
              {ro && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex justify-center items-center"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Section nav */}
            <nav className="w-56 shrink-0 border-r overflow-y-auto p-2 hidden md:block">
              {PSP_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === s.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </nav>

            {/* Section content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* mobile section picker */}
              <select className="input mb-4 md:hidden" value={activeSection} onChange={(e) => setActiveSection(e.target.value)}>
                {PSP_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              <h3 className="text-xl font-bold text-gray-900">{current.title}</h3>
              {current.intro && <p className="text-sm text-gray-500 mt-1">{current.intro}</p>}
              {current.note && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">{current.note}</p>}

              <div className="mt-4">
                {current.items.map((item, i) => renderItem(current, item, i))}
              </div>
            </div>
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
              {saveMut.isPending ? 'Saving…' : 'Save Plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SignaturePad({ value, ro, onChange }: { value: string; ro: boolean; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Render an existing signature onto the canvas when it loads/changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  if (ro) {
    return value
      ? <img src={value} alt="signature" className="border rounded-lg bg-white max-h-32" />
      : <p className="text-sm text-gray-400 border rounded-lg p-3 bg-gray-50">Not signed</p>;
  }

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvasRef.current!.width / r.width), y: (e.clientY - r.top) * (canvasRef.current!.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; last.current = pos(e); (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const end = () => { if (drawing.current) { drawing.current = false; onChange(canvasRef.current!.toDataURL('image/png')); } };
  const clear = () => { const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); onChange(''); };

  return (
    <div className="space-y-1">
      <canvas
        ref={canvasRef}
        width={500}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="border rounded-lg bg-white w-full touch-none cursor-crosshair"
        style={{ maxWidth: 500 }}
      />
      <button type="button" onClick={clear} className="text-xs text-blue-600 hover:underline">Clear signature</button>
    </div>
  );
}

function CommentField({ label, value, ro, onChange }: { label: string; value: string; ro: boolean; onChange: (v: string) => void }) {
  if (ro) {
    if (!value) return <span className="hidden" />;
    return <p className="text-xs text-gray-500"><span className="font-medium">{label}:</span> {value}</p>;
  }
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className="input py-1 text-sm" />
  );
}
