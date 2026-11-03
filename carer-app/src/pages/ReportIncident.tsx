import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { incidentsApi } from '../api/incidents';

// Reporting an accident, incident or near miss, from the carer's phone, at the
// time it happened.
//
// Kept deliberately short. The office's Accident & Incident Form asks about
// securing the scene, witnesses, root causes and RIDDOR — none of which a
// carer standing in someone's hallway can answer, and asking would either
// produce guesses or stop them reporting at all. So this collects only what
// the person who was there actually knows, and the office investigates from
// it afterwards.

const KINDS = [
  { v: 'ACCIDENT', label: 'Accident', hint: 'Someone was hurt' },
  { v: 'INCIDENT', label: 'Incident', hint: 'Something happened, nobody hurt' },
  { v: 'NEAR_MISS', label: 'Near miss', hint: 'It almost happened' },
];

const CATEGORIES = [
  'Fall',
  'Injury to the person',
  'Injury to a carer',
  'Medication error',
  'Behaviour / aggression',
  'Property damage',
  'Missing person',
  'Safeguarding concern',
  'Other',
];

// datetime-local wants local wall-clock, not an ISO instant.
function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ReportIncident() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const shiftId = params.get('shiftId');
  const serviceUserId = params.get('clientId');
  const clientName = params.get('client') || '';

  const [kind, setKind] = useState('ACCIDENT');
  const [category, setCategory] = useState('');
  const [occurredAt, setOccurredAt] = useState(localNow());
  const [whatHappened, setWhatHappened] = useState('');
  const [injuries, setInjuries] = useState('');
  const [immediateAction, setImmediateAction] = useState('');
  const [whoInformed, setWhoInformed] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [emergencyServices, setEmergencyServices] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      incidentsApi.create({
        serviceUserId,
        shiftId,
        // A local wall-clock string with no zone; send it as a real instant.
        occurredAt: new Date(occurredAt).toISOString(),
        kind,
        category: category || undefined,
        whatHappened: whatHappened.trim(),
        injuries: injuries.trim() || undefined,
        immediateAction: immediateAction.trim() || undefined,
        whoInformed: whoInformed.trim() || undefined,
        witnesses: witnesses.trim() || undefined,
        emergencyServices,
      }),
    onSuccess: () => navigate('/', { replace: true }),
    onError: (e: { response?: { data?: { error?: string } } }) =>
      setErr(e?.response?.data?.error || 'Could not send the report. Please try again.'),
  });

  const canSend = whatHappened.trim().length > 0 && !mut.isPending;

  return (
    <Layout title="Report an incident">
      <div className="space-y-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-medium text-blue-600 -mt-1">
          ‹ Back
        </button>

        {clientName && (
          <div className="rounded-2xl bg-white border border-gray-200 p-3 text-sm">
            <span className="text-gray-500">About</span> <span className="font-semibold text-gray-800">{clientName}</span>
          </div>
        )}

        <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">What kind of thing was it?</p>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  onClick={() => setKind(k.v)}
                  className={`rounded-xl border px-2 py-2 text-left ${
                    kind === k.v ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="block text-sm font-semibold">{k.label}</span>
                  <span className={`block text-[11px] leading-tight ${kind === k.v ? 'text-blue-100' : 'text-gray-400'}`}>{k.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">When did it happen?</p>
            <input
              type="datetime-local"
              value={occurredAt}
              max={localNow()}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">What sort of thing?</p>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">What happened?</p>
            <textarea
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              rows={5}
              placeholder="In your own words — what you saw, in the order it happened."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Was anyone hurt, and how?</p>
            <textarea
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              rows={2}
              placeholder="Leave blank if nobody was hurt."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">What did you do straight away?</p>
            <textarea
              value={immediateAction}
              onChange={(e) => setImmediateAction(e.target.value)}
              rows={2}
              placeholder="First aid, made the area safe, stayed with them…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={emergencyServices}
              onChange={(e) => setEmergencyServices(e.target.checked)}
              className="h-5 w-5 accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-800">Emergency services were called</span>
          </label>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Who have you told?</p>
            <input
              value={whoInformed}
              onChange={(e) => setWhoInformed(e.target.value)}
              placeholder="On-call, the office, family, the GP…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Was anyone else there?</p>
            <input
              value={witnesses}
              onChange={(e) => setWitnesses(e.target.value)}
              placeholder="Names, if you know them"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Send this as soon as you can. The office will look into it and may come back to you — you do not need to work out why it
          happened. If someone is in danger now, phone 999 and the on-call number first.
        </p>

        {err && <p className="text-sm font-medium text-red-600">{err}</p>}

        <button
          onClick={() => mut.mutate()}
          disabled={!canSend}
          className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-bold text-base disabled:opacity-40"
        >
          {mut.isPending ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </Layout>
  );
}
