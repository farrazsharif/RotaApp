import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carePlansApi } from '../api/carePlans';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import { format } from 'date-fns';

interface Props {
  serviceUser: ServiceUser;
  onClose: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'tea', label: 'Tea' },
  { key: 'bed', label: 'Bed' },
] as const;

type SlotKey = typeof SLOTS[number]['key'];
type DaySchedule = Partial<Record<SlotKey, string>>;
type Schedule = Partial<Record<typeof DAYS[number], DaySchedule>>;

interface FormState {
  schedule: Schedule;
  tasksMorning: string;
  tasksLunch: string;
  tasksTea: string;
  tasksBed: string;
  numberOfCarers: string;
  carePackageInfo: string;
  otherNotes: string;
  reviewDate: string;
}

const emptyForm = (): FormState => ({
  schedule: {}, tasksMorning: '', tasksLunch: '', tasksTea: '', tasksBed: '',
  numberOfCarers: '', carePackageInfo: '', otherNotes: '', reviewDate: '',
});

const TASK_FIELDS: { key: keyof FormState; label: string }[] = [
  { key: 'tasksMorning', label: 'Morning' },
  { key: 'tasksLunch', label: 'Lunch' },
  { key: 'tasksTea', label: 'Tea' },
  { key: 'tasksBed', label: 'Bed' },
];

export default function CarePlanModal({ serviceUser, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: plan, isLoading } = useQuery({
    queryKey: ['care-plan', serviceUser.id],
    queryFn: () => carePlansApi.get(serviceUser.id),
  });

  useEffect(() => {
    if (plan) {
      let schedule: Schedule = {};
      try { schedule = plan.schedule ? JSON.parse(plan.schedule) : {}; } catch { schedule = {}; }
      setForm({
        schedule,
        tasksMorning: plan.tasksMorning || '', tasksLunch: plan.tasksLunch || '',
        tasksTea: plan.tasksTea || '', tasksBed: plan.tasksBed || '',
        numberOfCarers: plan.numberOfCarers || '', carePackageInfo: plan.carePackageInfo || '',
        otherNotes: plan.otherNotes || '',
        reviewDate: plan.reviewDate ? format(new Date(plan.reviewDate), 'yyyy-MM-dd') : '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [plan]);

  const saveMut = useMutation({
    mutationFn: () => carePlansApi.save(serviceUser.id, {
      schedule: JSON.stringify(form.schedule),
      tasksMorning: form.tasksMorning, tasksLunch: form.tasksLunch, tasksTea: form.tasksTea, tasksBed: form.tasksBed,
      numberOfCarers: form.numberOfCarers, carePackageInfo: form.carePackageInfo, otherNotes: form.otherNotes,
      reviewDate: form.reviewDate || undefined,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care-plan', serviceUser.id] }),
  });

  const setCell = (day: typeof DAYS[number], slot: SlotKey, val: string) =>
    setForm((f) => ({ ...f, schedule: { ...f.schedule, [day]: { ...f.schedule[day], [slot]: val } } }));

  const reviewOverdue = plan?.reviewDate ? new Date(plan.reviewDate) < new Date() : false;

  function printPlan() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const scheduleRows = DAYS.map((day) => `
      <tr>
        <td class="day-col">${esc(day)}</td>
        ${SLOTS.map((s) => `<td>${esc(form.schedule[day]?.[s.key] || '')}</td>`).join('')}
      </tr>
    `).join('');

    const taskRows = TASK_FIELDS
      .map(({ key, label }) => ({ label, value: (form[key] as string) || '' }))
      .filter((t) => t.value)
      .map((t) => `<div class="field"><div class="field-label">${esc(t.label)} — tasks</div><div class="field-value">${esc(t.value)}</div></div>`)
      .join('');

    const html = `<!DOCTYPE html><html><head><title>Care Plan — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
      <style>
        @page { size: portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
        h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
        th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; }
        th { background: #f3f3f3; }
        .day-col { font-weight: bold; white-space: nowrap; }
        .field { margin-bottom: 10px; }
        .field-label { font-size: 10px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }
        .field-value { font-size: 12px; white-space: pre-wrap; margin-top: 2px; }
        .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .sign-row { display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px; }
        .sign-row .line { border-top: 1px solid #333; width: 45%; padding-top: 4px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Care Plan</h1>
      <div class="sub">
        ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}
        ${serviceUser.dateOfBirth ? ` · DOB ${esc(format(new Date(serviceUser.dateOfBirth), 'dd MMM yyyy'))}` : ''}
        ${serviceUser.nhsNumber ? ` · NHS ${esc(serviceUser.nhsNumber)}` : ''}
        · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}
      </div>

      <h2>Weekly Visit Profile</h2>
      <table>
        <thead><tr><th>Day</th>${SLOTS.map((s) => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
        <tbody>${scheduleRows}</tbody>
      </table>

      <h2>Tasks Required (Any Preferences)</h2>
      ${taskRows || '<p style="font-size:12px;color:#777;">None recorded.</p>'}

      <h2>Care Package Details</h2>
      <div class="fields-grid">
        <div class="field"><div class="field-label">Number of Carers</div><div class="field-value">${esc(form.numberOfCarers || '—')}</div></div>
        <div class="field"><div class="field-label">Review Date</div><div class="field-value">${form.reviewDate ? esc(format(new Date(form.reviewDate), 'dd MMM yyyy')) : '—'}</div></div>
      </div>
      <div class="field"><div class="field-label">Care Package Information</div><div class="field-value">${esc(form.carePackageInfo || '—')}</div></div>
      <div class="field"><div class="field-label">Other Notes</div><div class="field-value">${esc(form.otherNotes || '—')}</div></div>

      <div class="sign-row">
        <div class="line">Carer signature / date</div>
        <div class="line">Service User / Representative signature / date</div>
      </div>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">Care Plan — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">
              {plan ? `Last updated ${format(new Date(plan.updatedAt), 'dd MMM yyyy, h:mm a')}` : (ro ? 'No care plan recorded yet' : 'No care plan yet — fill it in below')}
              {ro && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
          ) : (
            <>
              {/* Weekly visit profile */}
              <section>
                <h3 className="font-semibold text-gray-900 mb-2">Weekly Visit Profile</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-2 border font-medium text-gray-600">Day</th>
                        {SLOTS.map((s) => <th key={s.key} className="text-left p-2 border font-medium text-gray-600">{s.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day) => (
                        <tr key={day}>
                          <td className="p-2 border font-medium text-gray-700">{day}</td>
                          {SLOTS.map((s) => {
                            const v = form.schedule[day]?.[s.key] || '';
                            return (
                              <td key={s.key} className="p-1 border">
                                {ro ? (
                                  <span className="text-gray-800">{v || <span className="text-gray-300">—</span>}</span>
                                ) : (
                                  <input value={v} onChange={(e) => setCell(day, s.key, e.target.value)} placeholder="e.g. 8.00-8.45am" className="input py-1 text-sm" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Tasks required per visit */}
              <section>
                <h3 className="font-semibold text-gray-900 mb-2">Tasks Required (Any Preferences)</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {TASK_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      {ro ? (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{(form[key] as string) || <span className="text-gray-400">—</span>}</p>
                      ) : (
                        <textarea value={form[key] as string} rows={3} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={`Tasks for the ${label.toLowerCase()} visit…`} className="input resize-none text-sm" />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Care package details */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Number of Carers</label>
                  {ro ? <p className="text-sm text-gray-800">{form.numberOfCarers || '—'}</p> :
                    <input value={form.numberOfCarers} onChange={(e) => setForm({ ...form, numberOfCarers: e.target.value })} placeholder="e.g. 1 carer per visit" className="input text-sm" />}
                </div>
                <div className={`rounded-lg ${reviewOverdue ? 'border border-red-300 bg-red-50 p-2' : ''}`}>
                  <label className="label">Review Date</label>
                  {ro ? (
                    <p className="text-sm text-gray-800">{form.reviewDate ? format(new Date(form.reviewDate), 'dd MMM yyyy') : 'Not set'}</p>
                  ) : (
                    <input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} className="input w-48 text-sm" />
                  )}
                  {reviewOverdue && <p className="text-xs text-red-600 mt-1">⚠ Review overdue</p>}
                </div>
              </section>

              <section>
                <label className="label">Care Package Information</label>
                {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.carePackageInfo || <span className="text-gray-400">—</span>}</p> :
                  <textarea value={form.carePackageInfo} rows={3} onChange={(e) => setForm({ ...form, carePackageInfo: e.target.value })} className="input resize-none text-sm" />}
              </section>

              <section>
                <label className="label">Other Notes</label>
                {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.otherNotes || <span className="text-gray-400">—</span>}</p> :
                  <textarea value={form.otherNotes} rows={2} onChange={(e) => setForm({ ...form, otherNotes: e.target.value })} className="input resize-none text-sm" />}
              </section>
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t sticky bottom-0 bg-white">
          {isManager && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600 self-center">Saved ✓</span>}
          <div className="flex-1" />
          <button onClick={printPlan} className="btn-secondary btn">🖨 Print</button>
          <button onClick={onClose} className="btn-secondary btn">Close</button>
          {isManager && (
            <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save Care Plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
