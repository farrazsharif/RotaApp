import type { CareTask } from '../lib/careTasks';

// Inline editor for a client's per-visit care tasks. Each task has a name, an
// optional description, and an "On visit" assignment (a specific call, or every
// visit). Pure presentation + local-list editing — the parent owns the list and
// persists it via the normal service-user update.
export default function CareTasksEditor({ tasks, onChange, visitChoices }: {
  tasks: CareTask[];
  onChange: (tasks: CareTask[]) => void;
  // Ordered call names offered in the "On visit" dropdown (the client's planned
  // calls first, then standard presets). "All visits" is added here.
  visitChoices: string[];
}) {
  const update = (i: number, patch: Partial<CareTask>) =>
    onChange(tasks.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => onChange(tasks.filter((_, idx) => idx !== i));
  const add = () => onChange([...tasks, { name: '', description: '', visit: '' }]);

  return (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400">No tasks yet. Add tasks the carer must do on a visit — assign each to a specific call or to every visit.</p>
      ) : (
        tasks.map((t, i) => {
          // Keep an existing assignment selectable even if it isn't one of the
          // current choices (e.g. the client's calls changed since it was set).
          const choices = t.visit && !visitChoices.some((c) => c.toLowerCase() === t.visit!.toLowerCase())
            ? [t.visit, ...visitChoices]
            : visitChoices;
          return (
            <div key={i} className="border border-gray-100 rounded-lg p-2 bg-gray-50/50 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                <input
                  value={t.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Task name — e.g. Give shower"
                  className="input flex-1"
                />
                <select
                  value={t.visit || ''}
                  onChange={(e) => update(i, { visit: e.target.value })}
                  className="input w-44"
                  title="Which call this task belongs to"
                >
                  <option value="">All visits</option>
                  {choices.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => remove(i)} className="text-red-600 hover:text-red-700 text-lg px-1" title="Remove task">×</button>
              </div>
              <textarea
                value={t.description || ''}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Description (optional) — how to do it, things to watch for…"
                rows={2}
                className="input w-full ml-7 max-w-[calc(100%-1.75rem)]"
              />
              <div className="ml-7 max-w-[calc(100%-1.75rem)]">
                <input
                  value={t.phrase || ''}
                  onChange={(e) => update(i, { phrase: e.target.value })}
                  placeholder="Log wording (optional) — e.g. Assisted with a shower"
                  className="input w-full"
                />
                <p className="text-xs text-gray-400 mt-0.5">How it reads in the carer's visit note. Leave blank and it reads “Completed this visit: {t.name.trim() || 'task name'}”.</p>
              </div>
            </div>
          );
        })
      )}
      <button type="button" className="btn-secondary btn btn-sm" onClick={add}>+ Add task</button>
    </div>
  );
}
