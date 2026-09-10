import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { likesDislikesApi } from '../api/likesDislikes';
import { likesDislikesVersionsApi } from '../api/likesDislikesVersions';
import { printLikesDislikes, buildLikesDislikesHtml } from '../lib/likesDislikesPrint';
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
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [paper, setPaperState] = useState<PaperMeta>({});
  const setPaper = (patch: PaperMeta) => setPaperState((p) => ({ ...p, ...patch }));
  const [panel, setPanel] = useState<'none' | 'history'>('none');
  const [reviewLabel, setReviewLabel] = useState('');
  const [editing, setEditing] = useState(false);
  const [renewing, setRenewing] = useState(false);

  // Fields are read-only unless a manager is actively editing (or renewing).
  const ro = !(canEdit && editing);

  const { data: record, isLoading } = useQuery({
    queryKey: ['likes-dislikes', serviceUser.id],
    queryFn: () => likesDislikesApi.get(serviceUser.id),
  });

  // Load the form state from the saved record. Reused on mount and when
  // cancelling an edit (to discard unsaved changes).
  const loadFromRecord = () => {
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
  };

  useEffect(() => {
    loadFromRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // One-time: for a brand-new record an editor can create, open straight in edit
  // mode (the blank form) rather than the empty read-only view. Latched so a
  // background refetch can never kick the user out of edit mode mid-editing.
  const didInitEdit = useRef(false);
  useEffect(() => {
    if (isLoading || didInitEdit.current) return;
    didInitEdit.current = true;
    if (canEdit && !record) setEditing(true);
  }, [isLoading, record, canEdit]);

  // Overdue = the held-on-paper next-review date is set and in the past.
  const isOverdue = !!paper.reviewDate && new Date(paper.reviewDate) < new Date();

  const beginEdit = () => { setRenewing(false); setEditing(true); setPanel('none'); };
  const beginRenew = () => { setRenewing(true); setEditing(true); setPanel('none'); };
  const cancelEdit = () => { setEditing(false); setRenewing(false); loadFromRecord(); };

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
      setEditing(false);
      setRenewing(false);
      setPanel('history');
    },
  });

  const printSheet = () => printLikesDislikes(serviceUser, form, { createdAt: record?.createdAt, updatedAt: record?.updatedAt });

  // Read-only VIEW renders the formatted document (identical to the printout)
  // in a CSS-isolated iframe, built from the SAME form data Print uses.
  // Recomputed from the live form so the view refreshes after a Save; skipped
  // while editing to avoid rebuilding on keystroke.
  const viewHtml = useMemo(
    () => (editing ? '' : buildLikesDislikesHtml(serviceUser, form, { createdAt: record?.createdAt, updatedAt: record?.updatedAt, embed: true })),
    [editing, serviceUser, form, record?.createdAt, record?.updatedAt],
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">Likes &amp; Dislikes — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">
              {record ? `Last updated ${format(new Date(record.updatedAt), 'dd MMM yyyy, h:mm a')}` : (canEdit ? 'Nothing recorded yet — fill it in below' : 'Nothing recorded yet')}
              {!editing && ' · read-only'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <HeldOnPaperPanel meta={paper} ro={ro} onChange={setPaper} docExists={!!record} />

        <div className="p-6 space-y-5">
          {/* Renew banner — shown while archiving a new dated version */}
          {renewing && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>Renewing this review — make any changes below, then Save to archive the current version as a dated copy.</p>
              <div className="mt-2">
                <label className="label">Review label (optional)</label>
                <input value={reviewLabel} onChange={(e) => setReviewLabel(e.target.value)} className="input text-sm" placeholder="e.g. Annual review, 6-month review" />
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
          ) : !editing ? (
            // VIEW mode: formatted document (matches the printout), CSS-isolated in an iframe.
            <div className="-m-6 bg-gray-100">
              <iframe title="document preview" srcDoc={viewHtml} className="w-full h-[75vh] border-0" />
            </div>
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

        {/* Previous reviews panel */}
        {panel === 'history' && (
          <div className="border-t bg-gray-50 px-6 py-4 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Previous reviews</h3>
              <button onClick={() => setPanel('none')} className="text-gray-400 hover:text-gray-600 text-sm">Close ×</button>
            </div>
            <LikesDislikesHistory serviceUser={serviceUser} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 p-6 border-t sticky bottom-0 bg-white">
          {canEdit && saveMut.isSuccess && !saveMut.isPending && <span className="text-sm text-green-600 self-center">Saved ✓</span>}
          {saveError && <span className="text-sm text-red-600 self-center">{saveError}</span>}
          {reviewMut.isError && <span className="text-sm text-red-600 self-center">Review failed</span>}
          {!editing ? (
            <>
              {/* VIEW mode */}
              <button onClick={() => setPanel((p) => (p === 'history' ? 'none' : 'history'))} className="btn-secondary btn">🕘 Previous reviews</button>
              {canEdit && (
                <>
                  <button onClick={beginEdit} className="btn-secondary btn">✏️ Edit</button>
                  <button
                    onClick={beginRenew}
                    className={isOverdue ? 'btn text-amber-800 border-amber-400 bg-amber-50' : 'btn-secondary btn'}
                  >
                    {isOverdue ? '↻ Renew · due' : '↻ Renew'}
                  </button>
                </>
              )}
              <div className="flex-1" />
              <button onClick={printSheet} className="btn-secondary btn">🖨 Print</button>
              <button onClick={onClose} className="btn-secondary btn">Close</button>
            </>
          ) : (
            <>
              {/* EDIT mode */}
              <button onClick={cancelEdit} className="btn-secondary btn">Cancel</button>
              <div className="flex-1" />
              <button onClick={printSheet} className="btn-secondary btn">🖨 Print</button>
              {renewing ? (
                <button className="btn-primary btn" disabled={reviewMut.isPending} onClick={() => reviewMut.mutate()}>
                  {reviewMut.isPending ? 'Saving review…' : 'Save & archive review'}
                </button>
              ) : (
                <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? 'Saving…' : 'Save'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
