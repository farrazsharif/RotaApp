import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { servicePlanTemplateApi } from '../api/servicePlanTemplate';
import { usePermissions } from '../hooks/usePermissions';
import { defaultTemplateSections, newSectionId, newItemId, PspSection, PspItem, PspItemType } from '../lib/servicePlanSchema';

const TYPE_LABELS: { value: PspItemType; label: string; special?: boolean }[] = [
  { value: 'yn', label: 'Yes / No' },
  { value: 'choice', label: 'Single choice' },
  { value: 'check', label: 'Checkbox' },
  { value: 'text', label: 'Short text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'capability', label: 'Capability grid (special)', special: true },
  { value: 'signature', label: 'Signature (special)', special: true },
  { value: 'mhEquipment', label: 'Moving & handling equipment (special)', special: true },
  { value: 'equipment', label: 'Equipment supply/servicing (special)', special: true },
];

export default function ServicePlanTemplate() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [sections, setSections] = useState<PspSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: tpl, isLoading } = useQuery({ queryKey: ['service-plan-template'], queryFn: servicePlanTemplateApi.get });

  useEffect(() => {
    if (tpl) setSections(tpl.sections?.length ? deepClone(tpl.sections) : defaultTemplateSections());
  }, [tpl]);

  const saveMut = useMutation({
    mutationFn: () => servicePlanTemplateApi.save(sections),
    onSuccess: () => { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 3000); qc.invalidateQueries({ queryKey: ['service-plan-template'] }); },
  });
  const resetMut = useMutation({
    mutationFn: () => servicePlanTemplateApi.reset(),
    onSuccess: () => { setSections(defaultTemplateSections()); setDirty(false); qc.invalidateQueries({ queryKey: ['service-plan-template'] }); },
  });

  const change = (next: PspSection[]) => { setSections(next); setDirty(true); };

  const updateSection = (si: number, patch: Partial<PspSection>) => change(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const moveSection = (si: number, dir: -1 | 1) => {
    const j = si + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[si], next[j]] = [next[j], next[si]];
    change(next);
  };
  const deleteSection = (si: number) => {
    if (!confirm(`Delete the section “${sections[si].title}” and all its questions? Existing answers for these questions stay stored but stop showing.`)) return;
    change(sections.filter((_, i) => i !== si));
  };
  const addSection = () => change([...sections, { id: newSectionId(), title: 'New section', items: [] }]);

  const updateItem = (si: number, ii: number, patch: Partial<PspItem>) =>
    change(sections.map((s, i) => (i === si ? { ...s, items: s.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : s)));
  const moveItem = (si: number, ii: number, dir: -1 | 1) => {
    const items = sections[si].items;
    const j = ii + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[ii], next[j]] = [next[j], next[ii]];
    updateSection(si, { items: next });
  };
  const deleteItem = (si: number, ii: number) => updateSection(si, { items: sections[si].items.filter((_, k) => k !== ii) });
  const addItem = (si: number) => updateSection(si, { items: [...sections[si].items, { id: newItemId(), label: 'New question', type: 'yn' }] });

  if (!can('manage_settings')) return <div className="card text-gray-500 max-w-lg">You don't have permission to edit the service plan template.</div>;
  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-5 max-w-4xl pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/settings" className="text-sm text-blue-600 hover:underline">← Settings</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Service Plan Template</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Customise the Personal Service Plan questions for your organisation. Changes apply to every client's plan.
            Existing answers are kept and matched by question, so renaming or reordering never loses data.
          </p>
        </div>
        <button className="text-xs text-gray-500 hover:text-red-600 shrink-0" onClick={() => { if (confirm('Reset to the built-in default template? Your customisations to the question set will be removed (saved client answers are kept).')) resetMut.mutate(); }}>
          Reset to default
        </button>
      </div>

      <div className="space-y-4">
        {sections.map((section, si) => (
          <div key={section.id} className="card space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">{si + 1}.</span>
              <input value={section.title} onChange={(e) => updateSection(si, { title: e.target.value })} className="input font-semibold flex-1" placeholder="Section title" />
              <div className="flex items-center gap-0.5 shrink-0">
                <IconBtn title="Move up" disabled={si === 0} onClick={() => moveSection(si, -1)}>↑</IconBtn>
                <IconBtn title="Move down" disabled={si === sections.length - 1} onClick={() => moveSection(si, 1)}>↓</IconBtn>
                <IconBtn title="Delete section" onClick={() => deleteSection(si)} danger>🗑</IconBtn>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={section.intro || ''} onChange={(e) => updateSection(si, { intro: e.target.value || undefined })} className="input text-sm" placeholder="Intro text (optional)" />
              <input value={section.note || ''} onChange={(e) => updateSection(si, { note: e.target.value || undefined })} className="input text-sm" placeholder="Highlighted note (optional)" />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={!!section.action} onChange={(e) => updateSection(si, { action: e.target.checked })} />
              Add an “Action” column to Yes/No questions in this section
            </label>

            {/* Questions */}
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {section.items.map((item, ii) => (
                <div key={item.id || ii} className="py-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={item.label} onChange={(e) => updateItem(si, ii, { label: e.target.value })} className="input text-sm flex-1" placeholder="Question text" />
                    <select
                      value={item.type || 'yn'}
                      onChange={(e) => updateItem(si, ii, { type: e.target.value as PspItemType, options: e.target.value === 'choice' ? (item.options?.length ? item.options : ['Option 1', 'Option 2']) : undefined })}
                      className="input text-sm w-52 shrink-0"
                    >
                      {TYPE_LABELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconBtn title="Move up" disabled={ii === 0} onClick={() => moveItem(si, ii, -1)}>↑</IconBtn>
                      <IconBtn title="Move down" disabled={ii === section.items.length - 1} onClick={() => moveItem(si, ii, 1)}>↓</IconBtn>
                      <IconBtn title="Delete question" onClick={() => deleteItem(si, ii)} danger>🗑</IconBtn>
                    </div>
                  </div>
                  {item.type === 'choice' && (
                    <input
                      value={(item.options || []).join(', ')}
                      onChange={(e) => updateItem(si, ii, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                      className="input text-xs ml-4"
                      placeholder="Choices, comma separated (e.g. High, Medium, Low)"
                    />
                  )}
                </div>
              ))}
              {section.items.length === 0 && <p className="py-2 text-sm text-gray-400">No questions yet.</p>}
            </div>
            <button className="text-sm text-blue-600 hover:underline" onClick={() => addItem(si)}>+ Add question</button>
          </div>
        ))}
      </div>

      <button className="btn-secondary btn w-full" onClick={addSection}>+ Add section</button>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3 z-30">
        <p className="text-sm text-gray-500 flex-1">
          {saved ? <span className="text-green-600 font-medium">Saved ✓</span> : dirty ? 'Unsaved changes' : `${sections.length} sections · ${sections.reduce((n, s) => n + s.items.length, 0)} questions`}
        </p>
        <button className="btn-primary btn" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, title, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-7 w-7 rounded flex items-center justify-center text-sm ${disabled ? 'text-gray-200' : danger ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
