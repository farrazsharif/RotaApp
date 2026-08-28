import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import Layout from '../components/Layout';
import { placementsApi } from '../api/placements';

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const isoKey = (s: string) => format(new Date(s), 'yyyy-MM-dd');

interface LogData {
  mood: '' | 'GOOD' | 'OK' | 'LOW';
  personalCare: string;
  meals: string;
  fluids: string;
  activity: string;
  medication: string;
  night: string;
  incidents: string;
  notes: string;
}

const emptyLog = (): LogData => ({ mood: '', personalCare: '', meals: '', fluids: '', activity: '', medication: '', night: '', incidents: '', notes: '' });

const MOODS: { v: LogData['mood']; label: string }[] = [
  { v: 'GOOD', label: '😊 Good' },
  { v: 'OK', label: '😐 OK' },
  { v: 'LOW', label: '😟 Low' },
];

const TEXT_FIELDS: { key: keyof LogData; label: string; placeholder: string }[] = [
  { key: 'personalCare', label: 'Personal care', placeholder: 'Washing, dressing, continence, skin…' },
  { key: 'meals', label: 'Meals', placeholder: 'What they ate — breakfast, lunch, dinner, snacks' },
  { key: 'fluids', label: 'Fluids', placeholder: 'Drinks through the day, hydration' },
  { key: 'activity', label: 'Activity & wellbeing', placeholder: 'Mobility, activities, mood, visitors…' },
  { key: 'medication', label: 'Medication', placeholder: 'Meds given / prompted, any refusals' },
  { key: 'night', label: 'Night', placeholder: 'Sleep, any wakings / night support' },
  { key: 'incidents', label: 'Incidents / concerns', placeholder: 'Falls, accidents, anything to report' },
  { key: 'notes', label: 'General notes', placeholder: 'Anything else about the day' },
];

export default function LiveInPlacement() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: placements = [], isLoading } = useQuery({ queryKey: ['my-placements'], queryFn: placementsApi.mine });
  const placement = useMemo(() => placements.find((p) => p.id === id), [placements, id]);

  const { data: logs = [] } = useQuery({ queryKey: ['placement-logs', id], queryFn: () => placementsApi.logs(id), enabled: !!id });
  const logByDate = useMemo(() => new Map(logs.map((l) => [isoKey(l.date), l])), [logs]);

  // Selected day, clamped to the placement window; default today if in range.
  const [selected, setSelected] = useState<string>('');
  useEffect(() => {
    if (!placement) return;
    const start = isoKey(placement.startDate);
    const end = isoKey(placement.endDate);
    const todayK = dayKey(new Date());
    setSelected(todayK < start ? start : todayK > end ? end : todayK);
  }, [placement]);

  const [form, setForm] = useState<LogData>(emptyLog());
  useEffect(() => {
    const existing = logByDate.get(selected);
    if (existing?.data) {
      try { setForm({ ...emptyLog(), ...JSON.parse(existing.data) }); } catch { setForm(emptyLog()); }
    } else {
      setForm(emptyLog());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, logs]);

  const saveMut = useMutation({
    mutationFn: () => placementsApi.saveLog(id, selected, form as unknown as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['placement-logs', id] }),
  });

  if (isLoading) {
    return <Layout title="Placement"><div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div></Layout>;
  }
  if (!placement) {
    return (
      <Layout title="Placement">
        <p className="text-gray-500 text-center py-10">This placement isn't available.</p>
        <button onClick={() => navigate('/')} className="w-full rounded-xl bg-blue-600 text-white py-3 font-medium">Back to Today</button>
      </Layout>
    );
  }

  const client = placement.serviceUser;
  const canPrev = selected > isoKey(placement.startDate);
  const canNext = selected < isoKey(placement.endDate);
  const stepDay = (dir: number) => setSelected((s) => dayKey(addDays(new Date(s), dir)));
  const selDate = selected ? new Date(selected) : new Date();

  return (
    <Layout title="Live-in Placement">
      <button onClick={() => navigate('/')} className="text-sm text-blue-600 mb-3">← Today</button>

      {/* Placement header */}
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 mb-4">
        <p className="text-lg font-semibold text-gray-900">{client ? `${client.firstName} ${client.lastName}` : 'Client'}</p>
        {client?.address && <p className="text-sm text-gray-500">{[client.address, client.postcode].filter(Boolean).join(', ')}</p>}
        <div className="flex flex-wrap gap-2 mt-2 text-xs">
          <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-1">{isoKey(placement.startDate)} → {isoKey(placement.endDate)}</span>
          <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-1">{placement.nightType === 'WAKING' ? '🌙 Waking night' : '😴 Sleep-in'}</span>
        </div>
        {client?.phone && <a href={`tel:${client.phone}`} className="inline-block mt-2 text-sm text-blue-600">📞 {client.phone}</a>}
        {placement.note && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{placement.note}</p>}
      </div>

      {/* Day navigator */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => stepDay(-1)} disabled={!canPrev} className="px-3 py-2 rounded-lg bg-white border border-gray-200 disabled:opacity-40">←</button>
        <div className="text-center">
          <p className="font-semibold text-gray-800">{format(selDate, 'EEEE')}</p>
          <p className="text-sm text-gray-500">{format(selDate, 'd MMM yyyy')}{logByDate.has(selected) ? ' · logged ✓' : ''}</p>
        </div>
        <button onClick={() => stepDay(1)} disabled={!canNext} className="px-3 py-2 rounded-lg bg-white border border-gray-200 disabled:opacity-40">→</button>
      </div>

      {/* Daily log form */}
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">How was their day?</p>
          <div className="flex gap-2">
            {MOODS.map((m) => (
              <button key={m.v} onClick={() => setForm({ ...form, mood: form.mood === m.v ? '' : m.v })}
                className={`flex-1 py-2 rounded-lg text-sm border ${form.mood === m.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {TEXT_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <textarea value={form[key] as string} rows={2} placeholder={placeholder}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
      </div>

      <div className="sticky bottom-20 mt-4">
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="w-full rounded-xl bg-blue-600 text-white py-3 font-medium shadow-lg active:bg-blue-700 disabled:opacity-60">
          {saveMut.isPending ? 'Saving…' : saveMut.isSuccess ? 'Saved ✓' : 'Save day'}
        </button>
      </div>
    </Layout>
  );
}
