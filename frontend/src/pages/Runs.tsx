import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runsApi } from '../api/runs';
import { usersApi } from '../api/users';
import { Run } from '../types';

const SWATCHES = ['#2563eb', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#0891b2', '#dc2626', '#4b5563'];

export default function Runs() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [newTeam, setNewTeam] = useState<string[]>([]);

  const { data: runs = [], isLoading } = useQuery({ queryKey: ['runs'], queryFn: runsApi.list });
  const { data: staff = [] } = useQuery({ queryKey: ['users', 'active'], queryFn: () => usersApi.list({ active: true }) });
  const carers = [...staff].sort((a, b) => a.firstName.localeCompare(b.firstName));

  const createMut = useMutation({
    mutationFn: () => runsApi.create({ name: name.trim(), color, carerIds: newTeam }),
    onSuccess: () => { setName(''); setNewTeam([]); qc.invalidateQueries({ queryKey: ['runs'] }); },
  });

  const toggleNew = (id: string) => setNewTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Runs</h1>
        <p className="text-sm text-gray-500">
          Group calls into named rounds (e.g. “Run 1 – North”) and give each a default team. Assign a whole run's
          calls to its team in one click — and re-cover it just as fast when someone's off.
        </p>
      </div>

      {/* New run */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">New run</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Run 1 – North" />
          </div>
          <div>
            <label className="label">Colour</label>
            <div className="flex gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-gray-800' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={`colour ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label">Default team</label>
          <CarerPicker carers={carers} selected={newTeam} onToggle={toggleNew} />
        </div>
        <div className="flex justify-end">
          <button className="btn-primary btn" disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'Creating…' : 'Create run'}
          </button>
        </div>
      </div>

      {/* Existing runs */}
      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : runs.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No runs yet — create one above.</div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => <RunCard key={run.id} run={run} carers={carers} />)}
        </div>
      )}
    </div>
  );
}

function CarerPicker({ carers, selected, onToggle }: { carers: { id: string; firstName: string; lastName: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  if (carers.length === 0) return <p className="text-sm text-gray-400">No active carers.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {carers.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onToggle(c.id)}
            className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`}
          >
            {c.firstName} {c.lastName}
          </button>
        );
      })}
    </div>
  );
}

function RunCard({ run, carers }: { run: Run; carers: { id: string; firstName: string; lastName: string }[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState<string[]>(run.carers.map((c) => c.id));
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () => runsApi.update(run.id, { carerIds: team }),
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ['runs'] }); },
  });
  const deleteMut = useMutation({
    mutationFn: () => runsApi.remove(run.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });
  const applyMut = useMutation({
    mutationFn: (scope: 'future' | 'all') => runsApi.applyTeam(run.id, scope),
    onSuccess: (r) => { setApplyMsg(`${r.message} (${r.count} call${r.count === 1 ? '' : 's'})`); qc.invalidateQueries({ queryKey: ['shifts'] }); },
  });

  const toggle = (id: string) => setTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-4 w-4 rounded-full shrink-0" style={{ background: run.color || '#9ca3af' }} />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{run.name}</p>
            <p className="text-xs text-gray-400">{run.upcomingCount ?? 0} upcoming call{(run.upcomingCount ?? 0) === 1 ? '' : 's'}</p>
          </div>
        </div>
        <button className="text-xs text-red-600 hover:underline shrink-0" onClick={() => { if (confirm(`Delete “${run.name}”? Its calls stay on the schedule but are no longer grouped.`)) deleteMut.mutate(); }} disabled={deleteMut.isPending}>
          Delete
        </button>
      </div>

      {/* Team */}
      {!editing ? (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {run.carers.length === 0
            ? <span className="text-sm text-gray-400">No team yet</span>
            : run.carers.map((c) => <span key={c.id} className="badge-blue">{c.firstName} {c.lastName}</span>)}
          <button className="text-xs text-blue-600 hover:underline" onClick={() => { setTeam(run.carers.map((c) => c.id)); setEditing(true); }}>Edit team</button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <CarerPicker carers={carers} selected={team} onToggle={toggle} />
          <div className="flex gap-2">
            <button className="btn-primary btn text-sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>{saveMut.isPending ? 'Saving…' : 'Save team'}</button>
            <button className="btn text-sm text-gray-600" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Apply team to the run's calls */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
        <button
          className="btn text-sm border border-blue-600 text-blue-600 hover:bg-blue-50"
          disabled={applyMut.isPending || run.carers.length === 0}
          onClick={() => { if (confirm(`Assign this team to all upcoming “${run.name}” calls? Single calls are split between the team; double-ups are worked together. You can still change any individual call afterwards.`)) applyMut.mutate('future'); }}
        >
          {applyMut.isPending ? 'Applying…' : 'Assign team to upcoming calls'}
        </button>
        {run.carers.length === 0 && <span className="text-xs text-gray-400">Add a team first</span>}
        {applyMsg && <span className="text-xs text-green-600">{applyMsg}</span>}
      </div>
    </div>
  );
}
