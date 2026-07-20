import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { documentsApi, DocumentOwnerType, DocumentMeta } from '../api/documents';

const CATEGORIES: Record<DocumentOwnerType, string[]> = {
  USER: ['DBS Certificate', 'Contract', 'Reference', 'Right to Work', 'Training Certificate', 'ID / Passport', 'Fit for Work', 'Other'],
  SERVICE_USER: ['Care Assessment', 'GP Letter', 'Hospital Discharge', 'DoLS / Legal', 'Funding', 'Medication Chart', 'Consent', 'Other'],
};

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
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: config } = useQuery({ queryKey: ['documents-config'], queryFn: documentsApi.config });
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', ownerType, ownerId],
    queryFn: () => documentsApi.list(ownerType, ownerId),
  });

  // When "Other" is picked, the typed label is the category (falling back to
  // "Other" if left blank).
  const effectiveCategory = category === 'Other' ? (customCategory.trim() || 'Other') : (category || undefined);

  const uploadMut = useMutation({
    mutationFn: () => documentsApi.upload(ownerType, ownerId, file!, effectiveCategory),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] });
      setFile(null); setCategory(''); setCustomCategory(''); setError(null);
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Upload failed. Please try again.');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', ownerType, ownerId] }); setConfirmDeleteId(null); },
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
