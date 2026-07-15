import { CancelBilling } from '../api/shifts';

export interface CancelBillingValue {
  billable: boolean;
  chargeType: 'FULL' | 'PERCENT' | 'CUSTOM';
  chargePercent: number;
  chargeAmount: number;
  reason: string;
}

export const emptyCancelBilling: CancelBillingValue = {
  billable: false,
  chargeType: 'FULL',
  chargePercent: 50,
  chargeAmount: 0,
  reason: '',
};

export function toCancelBilling(v: CancelBillingValue): CancelBilling {
  return { billable: v.billable, chargeType: v.chargeType, chargePercent: v.chargePercent, chargeAmount: v.chargeAmount, reason: v.reason || undefined };
}

const REASON_PRESETS = ['Client in hospital', 'Family cancelled', 'Carer unavailable', 'Other'];

const pill = (on: boolean) =>
  `px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`;

// Chargeable / non-chargeable choice + charge basis + reason. Controlled, so
// the single-shift modal and the Schedule bulk-cancel can share it.
export function CancelBillingFields({ value, onChange }: { value: CancelBillingValue; onChange: (v: CancelBillingValue) => void }) {
  const set = (patch: Partial<CancelBillingValue>) => onChange({ ...value, ...patch });
  const isOther = !REASON_PRESETS.slice(0, 3).includes(value.reason);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium text-gray-700 mb-1">Billing</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => set({ billable: false })} className={pill(!value.billable)}>Non-chargeable</button>
          <button type="button" onClick={() => set({ billable: true })} className={pill(value.billable)}>Chargeable</button>
        </div>
      </div>

      {value.billable && (
        <div className="space-y-2 pl-1">
          <div className="flex gap-1.5 flex-wrap">
            {(['FULL', 'PERCENT', 'CUSTOM'] as const).map((t) => (
              <button key={t} type="button" onClick={() => set({ chargeType: t })} className={pill(value.chargeType === t)}>
                {t === 'FULL' ? 'Full rate' : t === 'PERCENT' ? 'Percentage' : 'Custom £'}
              </button>
            ))}
          </div>
          {value.chargeType === 'PERCENT' && (
            <label className="flex items-center gap-2 text-gray-700">
              Charge
              <input type="number" min={0} max={100} value={value.chargePercent} onChange={(e) => set({ chargePercent: Number(e.target.value) })} className="input w-20 py-1" />
              % of the visit
            </label>
          )}
          {value.chargeType === 'CUSTOM' && (
            <label className="flex items-center gap-2 text-gray-700">
              £
              <input type="number" min={0} step="0.01" value={value.chargeAmount} onChange={(e) => set({ chargeAmount: Number(e.target.value) })} className="input w-28 py-1" />
              per visit
            </label>
          )}
        </div>
      )}

      <div>
        <p className="font-medium text-gray-700 mb-1">Reason</p>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {REASON_PRESETS.map((r) => {
            const on = r === 'Other' ? isOther : value.reason === r;
            return (
              <button key={r} type="button" onClick={() => set({ reason: r === 'Other' ? '' : r })} className={pill(on)}>{r}</button>
            );
          })}
        </div>
        <input value={value.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Reason (optional)" className="input" />
      </div>
    </div>
  );
}
