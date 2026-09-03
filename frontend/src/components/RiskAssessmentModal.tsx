import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { riskAssessmentsApi } from '../api/riskAssessments';
import { usePermissions } from '../hooks/usePermissions';
import { ServiceUser } from '../types';
import { RaForm, RaItem, RaSection, RiskVal, HazardVal, YesNoVal, keyForRaItem } from '../lib/riskAssessmentSchema';
import { printRiskAssessment } from '../lib/riskAssessmentPrint';
import SignaturePad from './SignaturePad';
import { format } from 'date-fns';

interface Props {
  serviceUser: ServiceUser;
  form: RaForm;
  onClose: () => void;
}

const LEVELS: { v: RiskVal['level']; label: string; on: string }[] = [
  { v: 'LOW', label: 'Low', on: 'bg-green-600 text-white border-green-600' },
  { v: 'MED', label: 'Med', on: 'bg-amber-500 text-white border-amber-500' },
  { v: 'HIGH', label: 'High', on: 'bg-red-600 text-white border-red-600' },
];

const HML: { v: HazardVal['level']; label: string; on: string }[] = [
  { v: 'L', label: 'Low', on: 'bg-green-600 text-white border-green-600' },
  { v: 'M', label: 'Med', on: 'bg-amber-500 text-white border-amber-500' },
  { v: 'H', label: 'High', on: 'bg-red-600 text-white border-red-600' },
];

export default function RiskAssessmentModal({ serviceUser, form, onClose }: Props) {
  const canEdit = usePermissions().can('manage_service_users');
  const ro = !canEdit;
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [activeSection, setActiveSection] = useState(form.sections[0].id);

  const { data: ra, isLoading } = useQuery({
    queryKey: ['risk-assessment', serviceUser.id, form.type],
    queryFn: () => riskAssessmentsApi.get(serviceUser.id, form.type),
  });

  useEffect(() => {
    if (ra?.data) {
      try { setValues(JSON.parse(ra.data)); } catch { setValues({}); }
    } else {
      setValues({});
    }
  }, [ra]);

  const saveMut = useMutation({
    mutationFn: () => riskAssessmentsApi.save(serviceUser.id, form.type, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risk-assessment', serviceUser.id, form.type] });
      qc.invalidateQueries({ queryKey: ['risk-assessments', serviceUser.id] });
    },
  });

  const set = (key: string, val: unknown) => setValues((v) => ({ ...v, [key]: val }));

  // "Held on paper" metadata — lets the office log a legacy paper assessment
  // (attached as a scan in Documents) with just the essentials, without filling
  // in every field. Stored under a reserved __paper key so it can't collide with
  // form item keys.
  type PaperMeta = { onFile?: boolean; completedDate?: string; reviewDate?: string; assessor?: string };
  const paper = (values.__paper as PaperMeta) || {};
  const setPaper = (patch: PaperMeta) => setValues((v) => ({ ...v, __paper: { ...((v.__paper as PaperMeta) || {}), ...patch } }));
  const risk = (key: string): RiskVal => (values[key] as RiskVal) || { level: '', comment: '', action: '' };
  const hazard = (key: string): HazardVal => (values[key] as HazardVal) || { level: '', whoHarmed: '', controlled: '', actions: '' };
  const yesno = (key: string): YesNoVal => (values[key] as YesNoVal) || { v: '', comment: '' };
  const str = (key: string): string => (values[key] as string) || '';

  // Progress: how many hazard sections have at least one item rated.
  const rated = useMemo(() => {
    return form.sections.filter((s) =>
      s.items.some((item, i) => {
        const key = keyForRaItem(s.id, i);
        const v = values[key];
        const t = item.type || 'risk';
        if (t === 'risk' || t === 'hazard') return !!v && (v as { level?: string }).level !== '' && (v as { level?: string }).level !== undefined;
        if (t === 'yesno') return !!v && (v as YesNoVal).v !== '';
        return typeof v === 'string' ? v.trim() !== '' : false;
      }),
    ).length;
  }, [values, form]);

  const doPrint = () => printRiskAssessment(serviceUser, form, values, { createdAt: ra?.createdAt, updatedAt: ra?.updatedAt });

  function renderItem(section: RaSection, item: RaItem, idx: number) {
    const key = keyForRaItem(section.id, idx);
    const type = item.type || 'risk';

    if (type === 'risk') {
      const v = risk(key);
      return (
        <div key={key} className="py-2.5 border-b last:border-0">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <span className="text-sm text-gray-800 flex-1 min-w-[220px]">
              <span className="text-gray-400 mr-1.5">{idx + 1}.</span>{item.label}
            </span>
            {ro ? (
              <span className={`text-xs font-bold ${v.level === 'HIGH' ? 'text-red-600' : v.level === 'MED' ? 'text-amber-600' : v.level === 'LOW' ? 'text-green-700' : 'text-gray-400'}`}>
                {v.level ? LEVELS.find((l) => l.v === v.level)!.label : '—'}
              </span>
            ) : (
              <div className="flex gap-1">
                {LEVELS.map((l) => (
                  <button
                    key={l.v}
                    type="button"
                    onClick={() => set(key, { ...v, level: v.level === l.v ? '' : l.v })}
                    className={`px-3 py-1 rounded-md text-xs font-medium border ${v.level === l.v ? l.on : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 mt-1.5 sm:grid-cols-2">
            <CommentField label="Comment" value={v.comment} ro={ro} onChange={(c) => set(key, { ...v, comment: c })} />
            <CommentField label="Action needed" value={v.action} ro={ro} onChange={(a) => set(key, { ...v, action: a })} />
          </div>
        </div>
      );
    }

    if (type === 'hazard') {
      const v = hazard(key);
      return (
        <div key={key} className="py-2.5 border-b last:border-0">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="flex-1 min-w-[220px]">
              <span className="text-sm text-gray-800">{item.label}</span>
              {item.hint && <span className="block text-xs text-gray-400">{item.hint}</span>}
            </div>
            {ro ? (
              <span className={`text-xs font-bold ${v.level === 'H' ? 'text-red-600' : v.level === 'M' ? 'text-amber-600' : v.level === 'L' ? 'text-green-700' : 'text-gray-400'}`}>
                {v.level ? HML.find((l) => l.v === v.level)!.label : '—'}
              </span>
            ) : (
              <div className="flex gap-1">
                {HML.map((l) => (
                  <button
                    key={l.v}
                    type="button"
                    onClick={() => set(key, { ...v, level: v.level === l.v ? '' : l.v })}
                    className={`px-3 py-1 rounded-md text-xs font-medium border ${v.level === l.v ? l.on : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 mt-1.5 sm:grid-cols-3">
            <CommentField label="Who may be harmed" value={v.whoHarmed} ro={ro} onChange={(x) => set(key, { ...v, whoHarmed: x })} />
            <CommentField label="How is the risk controlled" value={v.controlled} ro={ro} onChange={(x) => set(key, { ...v, controlled: x })} />
            <CommentField label="Actions required" value={v.actions} ro={ro} onChange={(x) => set(key, { ...v, actions: x })} />
          </div>
        </div>
      );
    }

    if (type === 'yesno') {
      const v = yesno(key);
      return (
        <div key={key} className="py-2.5 border-b last:border-0">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <span className="text-sm text-gray-800 flex-1 min-w-[220px]">
              <span className="text-gray-400 mr-1.5">{idx + 1}.</span>{item.label}
            </span>
            {ro ? (
              <span className={`text-xs font-bold ${v.v === 'YES' ? 'text-green-700' : v.v === 'NO' ? 'text-red-600' : 'text-gray-400'}`}>{v.v || '—'}</span>
            ) : (
              <div className="flex gap-1">
                {(['YES', 'NO'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(key, { ...v, v: v.v === opt ? '' : opt })}
                    className={`px-3 py-1 rounded-md text-xs font-medium border ${
                      v.v === opt
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
          <div className="mt-1.5">
            <CommentField label="Comment" value={v.comment} ro={ro} onChange={(c) => set(key, { ...v, comment: c })} />
          </div>
        </div>
      );
    }

    if (type === 'signature') {
      const dataUrl = str(key);
      return (
        <div key={key} className="py-3 border-b last:border-0">
          <p className="text-sm text-gray-800 mb-2">{item.label}</p>
          <SignaturePad value={dataUrl} ro={ro} onChange={(d) => set(key, d)} />
        </div>
      );
    }

    // text / longtext / date
    const v = str(key);
    return (
      <div key={key} className="py-2 border-b last:border-0">
        <label className="label">{item.label}</label>
        {ro ? (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {type === 'date' && v ? format(new Date(v), 'dd MMM yyyy') : v || <span className="text-gray-400">—</span>}
          </p>
        ) : type === 'longtext' ? (
          <textarea value={v} rows={3} onChange={(e) => set(key, e.target.value)} className="input resize-none text-sm" />
        ) : (
          <input type={type === 'date' ? 'date' : 'text'} value={v} onChange={(e) => set(key, e.target.value)} className="input text-sm" />
        )}
      </div>
    );
  }

  const current = form.sections.find((s) => s.id === activeSection) ?? form.sections[0];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">{form.title} — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">
              {ra ? `Last updated ${format(new Date(ra.updatedAt), 'dd MMM yyyy, h:mm a')}` : 'Not started'}
              {` · ${rated}/${form.sections.length} sections started`}
              {ro && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Held-on-paper: log a legacy paper assessment with just the essentials. */}
        <div className="border-b bg-amber-50/60 px-5 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={!!paper.onFile} disabled={ro} onChange={(e) => setPaper({ onFile: e.target.checked })} className="h-4 w-4 accent-amber-600" />
            📄 This assessment is held on paper (scan attached in Documents)
          </label>
          {paper.onFile && (
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              <div>
                <label className="label">Date completed</label>
                {ro ? <p className="text-sm text-gray-800">{paper.completedDate ? format(new Date(paper.completedDate), 'dd MMM yyyy') : '—'}</p>
                    : <input type="date" value={paper.completedDate || ''} onChange={(e) => setPaper({ completedDate: e.target.value })} className="input text-sm" />}
              </div>
              <div>
                <label className="label">Next review date</label>
                {ro ? <p className="text-sm text-gray-800">{paper.reviewDate ? format(new Date(paper.reviewDate), 'dd MMM yyyy') : '—'}</p>
                    : <input type="date" value={paper.reviewDate || ''} onChange={(e) => setPaper({ reviewDate: e.target.value })} className="input text-sm" />}
              </div>
              <div>
                <label className="label">Assessor</label>
                {ro ? <p className="text-sm text-gray-800">{paper.assessor || '—'}</p>
                    : <input type="text" value={paper.assessor || ''} onChange={(e) => setPaper({ assessor: e.target.value })} className="input text-sm" placeholder="Name of assessor" />}
              </div>
              <p className="sm:col-span-3 text-xs text-gray-500">
                Attach the scanned form on the client's <span className="font-medium">Documents</span> tab. You can leave the sections below blank, or fill them in later at the next review.
              </p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex-1 flex justify-center items-center"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <nav className="w-56 shrink-0 border-r overflow-y-auto p-2 hidden md:block">
              {form.sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${current?.id === s.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {s.title}
                </button>
              ))}
            </nav>

            <div className="flex-1 overflow-y-auto p-6">
              <select className="input mb-4 md:hidden" value={current?.id ?? ''} onChange={(e) => setActiveSection(e.target.value)}>
                {form.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>

              <h3 className="text-xl font-bold text-gray-900">{current?.title}</h3>
              {current?.intro && <p className="text-sm text-gray-500 mt-1">{current.intro}</p>}

              <div className="mt-4">
                {current?.items.map((item, i) => renderItem(current, item, i))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 p-4 border-t">
          {canEdit && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600">Saved ✓</span>}
          {saveMut.isError && <span className="text-sm text-red-600">Save failed</span>}
          <div className="flex-1" />
          <button onClick={doPrint} className="btn-secondary btn">🖨 Print</button>
          <button onClick={onClose} className="btn-secondary btn">Close</button>
          {canEdit && (
            <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentField({ label, value, ro, onChange }: { label: string; value: string; ro: boolean; onChange: (v: string) => void }) {
  if (ro) {
    if (!value) return <span className="hidden" />;
    return <p className="text-xs text-gray-500"><span className="font-medium">{label}:</span> {value}</p>;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} className="input py-1 text-sm" />;
}

