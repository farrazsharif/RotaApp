import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '../hooks/usePermissions';
import { fundersApi, FunderData } from '../api/funders';
import { fundingApi } from '../api/funding';
import { serviceUsersApi } from '../api/serviceUsers';
import { Funder, FunderType, FundingArrangement, ServiceUser } from '../types';

const FUNDER_TYPE_META: Record<FunderType, { label: string; className: string }> = {
  COUNCIL: { label: 'Council / LA', className: 'bg-blue-100 text-blue-700' },
  PRIVATE: { label: 'Private', className: 'bg-green-100 text-green-700' },
  NHS_CHC: { label: 'NHS CHC', className: 'bg-purple-100 text-purple-700' },
};

type Tab = 'funding' | 'funders';

export default function Finances() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('funding');

  if (!can('manage_billing')) {
    return <div className="card text-center py-12 text-gray-400">You don't have access to Finances.</div>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'funding', label: 'Service User Funding' },
    { key: 'funders', label: 'Funders' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Finances</h1>

      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-1 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'funding' && <FundingManager />}
      {tab === 'funders' && <FundersManager />}
    </div>
  );
}

/* ---------------- Service User Funding ---------------- */
function FundingManager() {
  const { data: serviceUsers = [], isLoading: suLoading } = useQuery({ queryKey: ['service-users'], queryFn: () => serviceUsersApi.list() });
  const { data: arrangements = [] } = useQuery({ queryKey: ['funding-all'], queryFn: fundingApi.listAll });
  const { data: funders = [] } = useQuery({ queryKey: ['funders'], queryFn: fundersApi.list });
  const [editSu, setEditSu] = useState<ServiceUser | null>(null);

  const byServiceUser = new Map<string, FundingArrangement>();
  arrangements.forEach((a) => byServiceUser.set(a.serviceUserId, a));

  return (
    <div className="card p-0 overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-gray-900">Service User Funding</h2>
        <p className="text-sm text-gray-500">Assign a funder and hourly charge rate to each service user.</p>
      </div>

      {funders.length === 0 && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-800">
          No funders yet — add councils / private payers in the <span className="font-medium">Funders</span> tab first.
        </div>
      )}

      {suLoading ? (
        <div className="p-6 text-sm text-gray-400">Loading…</div>
      ) : serviceUsers.length === 0 ? (
        <div className="p-6 text-sm text-gray-400">No service users yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Service User</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Funder</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Charge Rate</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {serviceUsers.map((su) => {
                const arr = byServiceUser.get(su.id);
                return (
                  <tr key={su.id}>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{su.firstName} {su.lastName}</td>
                    <td className="px-4 py-2.5">
                      {arr?.funder ? (
                        <span className="inline-flex items-center gap-2">
                          {arr.funder.name}
                          <span className={`badge ${FUNDER_TYPE_META[arr.funder.type].className}`}>{FUNDER_TYPE_META[arr.funder.type].label}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">— not set</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{arr ? `£${arr.rate.toFixed(2)} / hr` : '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button className="text-blue-600 text-xs hover:underline" onClick={() => setEditSu(su)}>{arr ? 'Edit' : 'Set funder'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editSu && (
        <FundingModal
          serviceUser={editSu}
          arrangement={byServiceUser.get(editSu.id) || null}
          funders={funders}
          onClose={() => setEditSu(null)}
        />
      )}
    </div>
  );
}

function FundingModal({ serviceUser, arrangement, funders, onClose }: {
  serviceUser: ServiceUser;
  arrangement: FundingArrangement | null;
  funders: Funder[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [funderId, setFunderId] = useState(arrangement?.funderId || funders[0]?.id || '');
  const [rate, setRate] = useState(arrangement ? String(arrangement.rate) : '');
  const [poNumber, setPoNumber] = useState(arrangement?.poNumber || '');
  const [startDate, setStartDate] = useState(arrangement?.startDate ? arrangement.startDate.slice(0, 10) : '');
  const [error, setError] = useState('');

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['funding-all'] }); qc.invalidateQueries({ queryKey: ['funders'] }); };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { funderId, rate: Number(rate) || 0, poNumber: poNumber || undefined, startDate: startDate || undefined };
      return arrangement ? fundingApi.update(arrangement.id, payload) : fundingApi.create({ serviceUserId: serviceUser.id, ...payload });
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not save funding.');
    },
  });
  const deleteMut = useMutation({
    mutationFn: () => fundingApi.delete(arrangement!.id),
    onSuccess: () => { invalidate(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-gray-900">Funding — {serviceUser.firstName} {serviceUser.lastName}</h2>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

        {funders.length === 0 ? (
          <p className="text-sm text-gray-500">No funders exist yet. Add one in the Funders tab first.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Funder</label>
              <select value={funderId} onChange={(e) => setFunderId(e.target.value)} className="input">
                {funders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div><label className="label">Charge Rate (£/hr)</label><input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="input" placeholder="e.g. 22.50" /></div>
            <div><label className="label">PO / Reference</label><input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="input" /></div>
            <div><label className="label">Start Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" /></div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button className="btn-secondary btn" onClick={onClose}>Cancel</button>
          {arrangement && <button className="btn-danger btn" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Remove</button>}
          <div className="flex-1" />
          {funders.length > 0 && (
            <button className="btn-primary btn" disabled={!funderId || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Funders ---------------- */
const emptyFunder: FunderData = { name: '', type: 'PRIVATE', contactName: '', email: '', phone: '', paymentTermsDays: 30 };

function FundersManager() {
  const qc = useQueryClient();
  const { data: funders = [], isLoading } = useQuery({ queryKey: ['funders'], queryFn: fundersApi.list });
  const [form, setForm] = useState<FunderData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => { setForm(null); setEditingId(null); setError(''); };
  const invalidate = () => qc.invalidateQueries({ queryKey: ['funders'] });
  const set = (patch: Partial<FunderData>) => setForm((f) => ({ ...(f ?? emptyFunder), ...patch }));

  const saveMut = useMutation({
    mutationFn: () => (editingId ? fundersApi.update(editingId, form!) : fundersApi.create(form!)),
    onSuccess: () => { invalidate(); reset(); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not save funder.');
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => fundersApi.delete(id),
    onSuccess: () => { invalidate(); setConfirmDeleteId(null); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not delete funder.');
      setConfirmDeleteId(null);
    },
  });

  return (
    <div className="card space-y-5 max-w-2xl">
      <div>
        <h2 className="font-semibold text-gray-900">Funders</h2>
        <p className="text-sm text-gray-500">Councils, private clients and NHS bodies that get billed for care.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : funders.length === 0 ? (
        <p className="text-sm text-gray-400">No funders yet.</p>
      ) : (
        <div className="space-y-2">
          {funders.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {f.name} <span className={`badge ${FUNDER_TYPE_META[f.type].className}`}>{FUNDER_TYPE_META[f.type].label}</span>
                </p>
                <p className="text-xs text-gray-400">
                  {f._count?.fundingArrangements ?? 0} service user{(f._count?.fundingArrangements ?? 0) === 1 ? '' : 's'}
                  {f.paymentTermsDays ? ` · ${f.paymentTermsDays}-day terms` : ''}
                </p>
              </div>
              {confirmDeleteId === f.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-red-700">Delete this funder?</span>
                  <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(f.id)}>Yes</button>
                  <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                </span>
              ) : (
                <span className="flex gap-2">
                  <button
                    className="text-blue-600 text-xs hover:underline"
                    onClick={() => {
                      setEditingId(f.id);
                      setForm({
                        name: f.name, type: f.type, contactName: f.contactName || '', email: f.email || '',
                        phone: f.phone || '', billingAddress: f.billingAddress || '', poReference: f.poReference || '',
                        paymentTermsDays: f.paymentTermsDays, vatExempt: f.vatExempt, notes: f.notes || '',
                      });
                      setError('');
                    }}
                  >Edit</button>
                  <button className="text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(f.id)}>Delete</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {form ? (
        <div className="border-t pt-4 space-y-3">
          <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Funder' : 'Add Funder'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Name *</label><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" placeholder="e.g. Stockport Council" /></div>
            <div>
              <label className="label">Type</label>
              <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
                <option value="COUNCIL">Council / Local Authority</option>
                <option value="PRIVATE">Private / Self-funded</option>
                <option value="NHS_CHC">NHS CHC</option>
              </select>
            </div>
            <div><label className="label">Contact Name</label><input value={form.contactName || ''} onChange={(e) => set({ contactName: e.target.value })} className="input" /></div>
            <div><label className="label">Email</label><input value={form.email || ''} onChange={(e) => set({ email: e.target.value })} className="input" /></div>
            <div><label className="label">Phone</label><input value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} className="input" /></div>
            <div><label className="label">Payment Terms (days)</label><input type="number" step="1" value={form.paymentTermsDays ?? 30} onChange={(e) => set({ paymentTermsDays: Number(e.target.value) })} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Billing Address</label><textarea value={form.billingAddress || ''} onChange={(e) => set({ billingAddress: e.target.value })} rows={2} className="input resize-none" /></div>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary btn" onClick={reset}>Cancel</button>
            <div className="flex-1" />
            <button className="btn-primary btn" disabled={!form.name || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Funder'}
            </button>
          </div>
        </div>
      ) : (
        <div><button className="btn-primary btn" onClick={() => { setForm(emptyFunder); setEditingId(null); setError(''); }}>+ Add Funder</button></div>
      )}
    </div>
  );
}
