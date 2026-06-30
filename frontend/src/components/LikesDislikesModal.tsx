import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { likesDislikesApi } from '../api/likesDislikes';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import { format } from 'date-fns';

interface Props {
  serviceUser: ServiceUser;
  onClose: () => void;
}

interface FormState {
  likes: string;
  dislikes: string;
  lifeHistory: string;
  health: string;
  whatPeopleLike: string;
  relationships: string;
  goodDay: string;
  badDay: string;
}

const emptyForm = (): FormState => ({
  likes: '', dislikes: '', lifeHistory: '', health: '',
  whatPeopleLike: '', relationships: '', goodDay: '', badDay: '',
});

const FIELDS: { key: keyof FormState; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'dislikes', label: 'Dislikes' },
  { key: 'lifeHistory', label: 'A Little of My Life History' },
  { key: 'health', label: 'My Health' },
  { key: 'whatPeopleLike', label: 'What Might People Like About Me?' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'goodDay', label: 'What Makes a Good Day for Me' },
  { key: 'badDay', label: 'What Makes a Bad Day for Me' },
];

export default function LikesDislikesModal({ serviceUser, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: record, isLoading } = useQuery({
    queryKey: ['likes-dislikes', serviceUser.id],
    queryFn: () => likesDislikesApi.get(serviceUser.id),
  });

  useEffect(() => {
    if (record) {
      setForm({
        likes: record.likes || '', dislikes: record.dislikes || '',
        lifeHistory: record.lifeHistory || '', health: record.health || '',
        whatPeopleLike: record.whatPeopleLike || '', relationships: record.relationships || '',
        goodDay: record.goodDay || '', badDay: record.badDay || '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [record]);

  const saveMut = useMutation({
    mutationFn: () => likesDislikesApi.save(serviceUser.id, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['likes-dislikes', serviceUser.id] }),
  });

  function printSheet() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const fieldRows = FIELDS
      .map(({ key, label }) => `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${esc(form[key] || '—')}</div></div>`)
      .join('');

    const html = `<!DOCTYPE html><html><head><title>Likes &amp; Dislikes — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
      <style>
        @page { size: portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
        .field { margin-bottom: 14px; }
        .field-label { font-size: 11px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }
        .field-value { font-size: 13px; white-space: pre-wrap; margin-top: 3px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Likes &amp; Dislikes</h1>
      <div class="sub">${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)} · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}</div>
      ${fieldRows}
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">Likes &amp; Dislikes — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">
              {record ? `Last updated ${format(new Date(record.updatedAt), 'dd MMM yyyy, h:mm a')}` : (ro ? 'Nothing recorded yet' : 'Nothing recorded yet — fill it in below')}
              {ro && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
          ) : (
            FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="label">{label}</label>
                {ro ? (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{form[key] || <span className="text-gray-400">—</span>}</p>
                ) : (
                  <textarea
                    value={form[key]}
                    rows={key === 'likes' || key === 'dislikes' ? 2 : 3}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="input resize-none text-sm"
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 p-6 border-t sticky bottom-0 bg-white">
          {isManager && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600 self-center">Saved ✓</span>}
          <div className="flex-1" />
          <button onClick={printSheet} className="btn-secondary btn">🖨 Print</button>
          <button onClick={onClose} className="btn-secondary btn">Close</button>
          {isManager && (
            <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
