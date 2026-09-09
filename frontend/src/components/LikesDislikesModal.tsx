import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { likesDislikesApi } from '../api/likesDislikes';
import { likesDislikesVersionsApi } from '../api/likesDislikesVersions';
import { printLikesDislikes } from '../lib/likesDislikesPrint';
import LikesDislikesHistory from './LikesDislikesHistory';
import { usePermissions } from '../hooks/usePermissions';
import { ServiceUser } from '../types';
import { format } from 'date-fns';
import HeldOnPaperPanel, { PaperMeta } from './HeldOnPaperPanel';
import AutoGrowTextarea from './AutoGrowTextarea';

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
  // Edit rights follow the actual capability, not the coarse base-role
  // "manager" flag — a custom manager role (e.g. Field Supervisor) that holds
  // manage_service_users can edit even though their base role isn't MANAGER.
  const canEdit = usePermissions().can('manage_service_users');
  const ro = !canEdit;
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [paper, setPaperState] = useState<PaperMeta>({});
  const setPaper = (patch: PaperMeta) => setPaperState((p) => ({ ...p, ...patch }));
  const [panel, setPanel] = useState<'none' | 'history' | 'review'>('none');
  const [reviewLabel, setReviewLabel] = useState('');

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
      try { setPaperState(record.paperMeta ? JSON.parse(record.paperMeta) : {}); } catch { setPaperState({}); }
    } else {
      setForm(emptyForm());
      setPaperState({});
    }
  }, [record]);

  const savePayload = () => ({ ...form, paperMeta: JSON.stringify(paper) });

  const [saveError, setSaveError] = useState<string | null>(null);
  const saveMut = useMutation({
    mutationFn: () => likesDislikesApi.save(serviceUser.id, savePayload()),
    onSuccess: () => { setSaveError(null); qc.invalidateQueries({ queryKey: ['likes-dislikes', serviceUser.id] }); onClose(); },
    onError: (e: { response?: { data?: { error?: string } } }) => setSaveError(e?.response?.data?.error || 'Could not save — please try again.'),
  });

  // Complete review: save the current record, then freeze an immutable dated
  // snapshot as an archived version. The live record stays editable.
  const reviewMut = useMutation({
    mutationFn: async () => {
      await likesDislikesApi.save(serviceUser.id, savePayload());
      return likesDislikesVersionsApi.create({ serviceUserId: serviceUser.id, label: reviewLabel.trim() || undefined });
    },
    onSuccess: () => {
      setReviewLabel('');
      qc.invalidateQueries({ queryKey: ['likes-dislikes', serviceUser.id] });
      qc.invalidateQueries({ queryKey: ['likes-dislikes-versions', serviceUser.id] });
      setPanel('history');
    },
  });

  const printSheet = () => printLikesDislikes(serviceUser, form, { createdAt: record?.createdAt, updatedAt: record?.updatedAt });

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

        <HeldOnPaperPanel meta={paper} ro={ro} onChange={setPaper} />

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
                  <AutoGrowTextarea
                    value={form[key]}
                    minRows={key === 'likes' || key === 'dislikes' ? 2 : 3}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="input text-sm"
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Previous reviews / Complete review panel */}
        {panel !== 'none' && (
          <div className="border-t bg-gray-50 px-6 py-4 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{panel === 'history' ? 'Previous reviews' : 'Complete review'}</h3>
              <button onClick={() => setPanel('none')} className="text-gray-400 hover:text-gray-600 text-sm">Close ×</button>
            </div>
            {panel === 'history' ? (
              <LikesDislikesHistory serviceUser={serviceUser} />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">This saves the current likes &amp; dislikes, then keeps a dated, read-only copy so past versions survive future edits. The live record stays editable.</p>
                <div>
                  <label className="label">Review label (optional)</label>
                  <input value={reviewLabel} onChange={(e) => setReviewLabel(e.target.value)} className="input text-sm" placeholder="e.g. Annual review, 6-month review" />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary btn btn-sm" disabled={reviewMut.isPending} onClick={() => reviewMut.mutate()}>
                    {reviewMut.isPending ? 'Saving review…' : 'Save & archive this review'}
                  </button>
                  <button className="btn-secondary btn btn-sm" onClick={() => setPanel('none')}>Cancel</button>
                  {reviewMut.isError && <span className="text-sm text-red-600 self-center">Failed — try again</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 p-6 border-t sticky bottom-0 bg-white">
          {canEdit && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600 self-center">Saved ✓</span>}
          {saveError && <span className="text-sm text-red-600 self-center">{saveError}</span>}
          <button onClick={() => setPanel((p) => (p === 'history' ? 'none' : 'history'))} className="btn-secondary btn">🕘 Previous reviews</button>
          {canEdit && (
            <button onClick={() => setPanel((p) => (p === 'review' ? 'none' : 'review'))} className="btn-secondary btn">✓ Complete review</button>
          )}
          <div className="flex-1" />
          <button onClick={printSheet} className="btn-secondary btn">🖨 Print</button>
          <button onClick={onClose} className="btn-secondary btn">Close</button>
          {canEdit && (
            <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
