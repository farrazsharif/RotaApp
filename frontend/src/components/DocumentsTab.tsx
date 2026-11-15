import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { documentsApi, DocumentOwnerType, DocumentMeta } from '../api/documents';

const CATEGORIES: Record<DocumentOwnerType, string[]> = {
  USER: ['DBS Certificate', 'Offer Letter', 'Contract', 'Reference', 'Right to Work', 'Training Certificate', 'ID', 'Driving Licence', 'Fit for Work', 'Proof of Address', 'Emergency Contact', 'Interview Questionnaire', 'Payroll Form', 'Staff Induction Confirmation', 'Consent to Hold DBS', 'Application Form', 'Shadowing Form', 'Induction Training', 'DBS ID Form', 'Lone Working Hazard Checklist', 'Confidentiality Form', 'Passport', 'Visa / BRP', 'Certificate of Sponsorship', 'English Language Test', 'TB Test Certificate', 'Overseas Police Check', 'Other'],
  SERVICE_USER: ['Care Assessment', 'Risk Assessment', 'Fire Safety Risk Assessment', 'Support Plan', 'Bathing / Showering Assessment', 'Likes & Dislikes', 'Personal Service Plan', 'Person-Centred One Page Profile', 'Contract of Care', 'GP Letter', 'Hospital Discharge', 'DoLS / Legal', 'Funding', 'Medication Chart', 'Consent', 'Other'],
};

// How far ahead a renewal is worth flagging. Long enough that a DBS, a visa or
// an insurance policy can actually be renewed in time - a warning the week it
// lapses is a warning nobody can act on.
const SOON_DAYS = 60;

// Document types that normally carry an expiry date, so the upload form asks
// for one instead of leaving it to be remembered later.
const EXPIRES: Record<DocumentOwnerType, string[]> = {
  USER: ['DBS Certificate', 'Right to Work', 'Training Certificate', 'Driving Licence', 'Passport', 'Visa / BRP', 'Certificate of Sponsorship', 'English Language Test', 'TB Test Certificate', 'Overseas Police Check', 'Fit for Work', 'ID'],
  SERVICE_USER: ['Risk Assessment', 'Fire Safety Risk Assessment', 'Bathing / Showering Assessment', 'DoLS / Legal', 'Funding', 'Consent'],
};

// Whole days from today to the expiry date, compared date to date: a document
// is valid through the whole of its last day, rather than lapsing at whatever
// time of day the page happens to be open.
function daysUntil(iso: string): number {
  const a = new Date(iso); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

type ExpiryState = { kind: 'none' } | { kind: 'ok' | 'soon' | 'expired'; days: number };
function expiryState(iso?: string | null): ExpiryState {
  if (!iso) return { kind: 'none' };
  const days = daysUntil(iso);
  if (days < 0) return { kind: 'expired', days };
  if (days <= SOON_DAYS) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsTab({ ownerType, ownerId, canManage }: { ownerType: DocumentOwnerType; ownerId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Editing the expiry of a document already uploaded - everything stored
  // before this field existed needs a date without being re-uploaded.
  const [editingExpiryId, setEditingExpiryId] = useState<string | null>(null);
  const [expiryDraft, setExpiryDraft] = useState('');

  const { data: config } = useQuery({ queryKey: ['documents-config'], queryFn: documentsApi.config });
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', ownerType, ownerId],
    queryFn: () => documentsApi.list(ownerType, ownerId),
  });

  // When "Other" is picked, the typed label is the category (falling back to
  // "Other" if left blank).
  const effectiveCategory = category === 'Other' ? (customCategory.trim() || 'Other') : (category || undefined);

  // Known-expiring types get a nudge rather than a rule: an office with the
  // certificate in front of them may not have been given a date.
  const expiryExpected = !!category && EXPIRES[ownerType].includes(category);

  const uploadMut = useMutation({
    mutationFn: () => documentsApi.upload(ownerType, ownerId, file!, effectiveCategory, uploadExpiry || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] });
      if (ownerType === 'USER') qc.invalidateQueries({ queryKey: ['user-compliance', ownerId] });
      setFile(null); setCategory(''); setCustomCategory(''); setUploadExpiry(''); setError(null);
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Upload failed. Please try again.');
    },
  });

  const expiryMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string | null }) => documentsApi.setExpiry(id, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] });
      if (ownerType === 'USER') qc.invalidateQueries({ queryKey: ['user-compliance', ownerId] });
      setEditingExpiryId(null);
    },
    onError: () => setError('Could not save that expiry date.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] });
      if (ownerType === 'USER') qc.invalidateQueries({ queryKey: ['user-compliance', ownerId] });
      setConfirmDeleteId(null);
    },
  });

  async function download(doc: DocumentMeta) {
    try {
      const url = await documentsApi.downloadUrl(doc.id);
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { setError('Could not open that file.'); }
  }

  async function view(doc: DocumentMeta) {
    // Open the tab synchronously (inside the click) so pop-up blockers allow it,
    // then point it at the signed URL once we have it. Note: passing 'noopener'
    // here makes window.open return null, so instead we null the opener manually.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const url = await documentsApi.downloadUrl(doc.id, true);
      if (win) win.location.href = url;
      else window.open(url, '_blank');
    } catch { win?.close(); setError('Could not open that file.'); }
  }

  // The expiry cell: a date, how urgent it is, and a way to change it. Kept
  // inline because it needs the edit state and the mutation above.
  function ExpiryCell({ d }: { d: DocumentMeta }) {
    const open = () => {
      setEditingExpiryId(d.id);
      setExpiryDraft(d.expiresAt ? format(new Date(d.expiresAt), 'yyyy-MM-dd') : '');
    };

    if (editingExpiryId === d.id) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <input type="date" value={expiryDraft} onChange={(e) => setExpiryDraft(e.target.value)} className="input py-1 text-xs w-36" autoFocus />
          <button className="btn-primary btn btn-sm" disabled={expiryMut.isPending} onClick={() => expiryMut.mutate({ id: d.id, value: expiryDraft || null })}>Save</button>
          <button className="btn-secondary btn btn-sm" onClick={() => setEditingExpiryId(null)}>Cancel</button>
        </span>
      );
    }

    const st = expiryState(d.expiresAt);
    if (st.kind === 'none') {
      return canManage
        ? <button className="text-blue-600 text-xs hover:underline" onClick={open}>Set date</button>
        : <span className="text-gray-400">—</span>;
    }

    const label = format(new Date(d.expiresAt!), 'dd MMM yyyy');
    const body =
      st.kind === 'expired' ? <span className="badge bg-red-100 text-red-800">{label} · expired</span>
      : st.kind === 'soon' ? <span className="badge bg-amber-100 text-amber-800">{label} · {st.days === 0 ? 'today' : `${st.days}d`}</span>
      : <span className="text-gray-600 whitespace-nowrap">{label}</span>;

    return canManage
      ? <button onClick={open} className="hover:underline" title="Change expiry date">{body}</button>
      : body;
  }

  const expiredCount = docs.filter((d) => expiryState(d.expiresAt).kind === 'expired').length;
  const soonCount = docs.filter((d) => expiryState(d.expiresAt).kind === 'soon').length;

  const notConfigured = config && !config.configured;

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900">Documents</h2>
        <p className="text-xs text-gray-500">Certificates, letters and other scanned files. Max 20MB each.</p>
      </div>

      {notConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Document storage isn’t set up yet.{canManage ? ' Add your Cloudflare R2 keys on the server to enable uploads — existing screens keep working meanwhile.' : ''}
        </div>
      )}

      {(expiredCount > 0 || soonCount > 0) && (
        <div className={`rounded-lg border p-3 text-sm ${expiredCount > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {expiredCount > 0 && <>{expiredCount} document{expiredCount === 1 ? ' has' : 's have'} expired. </>}
          {soonCount > 0 && <>{soonCount} expir{soonCount === 1 ? 'es' : 'e'} within {SOON_DAYS} days.</>}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-400">No documents uploaded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="text-left p-2.5 font-medium">Name</th>
                <th className="text-left p-2.5 font-medium">Category</th>
                <th className="text-left p-2.5 font-medium">Expires</th>
                <th className="text-left p-2.5 font-medium">Size</th>
                <th className="text-left p-2.5 font-medium">Uploaded</th>
                <th className="text-right p-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="p-2.5 text-gray-900 break-all">{d.fileName}</td>
                  <td className="p-2.5">{d.category ? <span className="badge-gray badge">{d.category}</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="p-2.5"><ExpiryCell d={d} /></td>
                  <td className="p-2.5 text-gray-600 whitespace-nowrap">{fmtSize(d.size)}</td>
                  <td className="p-2.5 text-gray-600 whitespace-nowrap">{format(new Date(d.createdAt), 'dd MMM yyyy')}</td>
                  <td className="p-2.5 text-right whitespace-nowrap">
                    <button className="text-blue-600 text-xs hover:underline" onClick={() => view(d)}>View</button>
                    <button className="ml-3 text-blue-600 text-xs hover:underline" onClick={() => download(d)}>Download</button>
                    {canManage && (
                      confirmDeleteId === d.id ? (
                        <span className="ml-3 inline-flex items-center gap-2">
                          <span className="text-xs text-red-700">Delete?</span>
                          <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(d.id)}>Yes</button>
                          <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                        </span>
                      ) : (
                        <button className="ml-3 text-red-600 text-xs hover:underline" onClick={() => setConfirmDeleteId(d.id)}>Delete</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && !notConfigured && (
        <div className="border-t pt-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Upload a document</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                <option value="">Uncategorised</option>
                {CATEGORIES[ownerType].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {category === 'Other' && (
                <input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Type a category…"
                  className="input mt-2"
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className="label">File</label>
              <input ref={fileRef} type="file" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }} className="input" />
            </div>
            <div>
              <label className="label">
                Expiry date {expiryExpected
                  ? <span className="text-amber-700 font-normal">— recommended for this type</span>
                  : <span className="text-gray-400 font-normal">(optional)</span>}
              </label>
              <input type="date" value={uploadExpiry} onChange={(e) => setUploadExpiry(e.target.value)} className="input" />
              <p className="text-xs text-gray-500 mt-1">
                {expiryExpected
                  ? 'Adding the date means this shows up before it lapses, not after.'
                  : 'Only for things that run out — DBS, passport, visa, insurance.'}
              </p>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button className="btn-primary btn" disabled={!file || uploadMut.isPending} onClick={() => uploadMut.mutate()}>
              {uploadMut.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
