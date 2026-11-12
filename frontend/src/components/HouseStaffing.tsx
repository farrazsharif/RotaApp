import { ServiceUser, User } from '../types';

// Staffing a Supported Living house visit.
//
// A house can mix funded ratios — resident A on 2:1, resident B on 1:1 — so
// "3 carers" is not enough to describe it. The office says how many carers each
// RESIDENT needs, and who is filling each of those places. That is what makes
// A's 2:1 evidencable to a funder, and what lets the schedule say "A needs 1
// more" instead of a flat "needs 1".
//
// A carer placed against a resident is not confined to them: on shift they
// cover each other's breaks, and the carer app lets anyone on the house log for
// anyone in it. The placement is about funding and staffing levels.

export interface SlotDraft {
  serviceUserId: string;
  userId: string | null;
}

interface Props {
  residents: ServiceUser[];
  staff: Pick<User, 'id' | 'firstName' | 'lastName' | 'active'>[];
  slots: SlotDraft[];
  onChange: (slots: SlotDraft[]) => void;
  disabled?: boolean;
}

const MAX_PER_RESIDENT = 4;

export default function HouseStaffing({ residents, staff, slots, onChange, disabled }: Props) {
  const forResident = (id: string) => slots.filter((s) => s.serviceUserId === id);

  // Set how many carers a resident needs. Rebuilt in resident order so the list
  // never reshuffles under the cursor; growing adds empty places, shrinking
  // drops from the end, so a carer already placed earlier stays put.
  const setCount = (serviceUserId: string, count: number) => {
    const next: SlotDraft[] = [];
    for (const r of residents) {
      const mine = forResident(r.id);
      const want = r.id === serviceUserId ? count : mine.length;
      for (let i = 0; i < want; i += 1) {
        next.push(mine[i] ?? { serviceUserId: r.id, userId: null });
      }
    }
    onChange(next);
  };

  const setCarer = (serviceUserId: string, index: number, userId: string) => {
    let seen = -1;
    onChange(
      slots.map((s) => {
        if (s.serviceUserId !== serviceUserId) return s;
        seen += 1;
        return seen === index ? { ...s, userId: userId || null } : s;
      }),
    );
  };

  if (residents.length === 0) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        No active residents are recorded at this house yet. Set each resident’s <strong>Site</strong> to
        this house on their record, and they’ll appear here.
      </p>
    );
  }

  const totalCarers = slots.length;
  const unfilled = slots.filter((s) => !s.userId).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Who needs carers, and how many *</label>
        <span className="text-xs text-gray-500">
          {totalCarers} carer{totalCarers === 1 ? '' : 's'} on shift
          {unfilled > 0 && <span className="text-amber-700 font-medium"> · {unfilled} to fill</span>}
        </span>
      </div>

      {residents.map((r) => {
        const mine = forResident(r.id);
        return (
          <div key={r.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-gray-800 text-sm">
                {r.firstName} {r.lastName}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-500">Carers</span>
                <select
                  className="input py-1 w-16 text-sm"
                  value={mine.length}
                  disabled={disabled}
                  onChange={(e) => setCount(r.id, Number(e.target.value))}
                >
                  {Array.from({ length: MAX_PER_RESIDENT + 1 }, (_, n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {mine.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {mine.map((slot, i) => (
                  <div key={`${r.id}-${i}`} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12 shrink-0">Carer {i + 1}</span>
                    <select
                      className={`input py-1 text-sm flex-1 ${slot.userId ? '' : 'text-gray-500'}`}
                      value={slot.userId ?? ''}
                      disabled={disabled}
                      onChange={(e) => setCarer(r.id, i, e.target.value)}
                    >
                      <option value="">Not assigned yet</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}{u.active === false ? ' (inactive)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-xs text-gray-500">
        A carer placed with one resident can still log for any resident in the house — this sets the
        funded staffing level, not who may write a record.
      </p>
    </div>
  );
}
