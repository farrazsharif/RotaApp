import api from '../lib/axios';

export type DocumentOwnerType = 'USER' | 'SERVICE_USER';

export interface DocumentMeta {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category?: string | null;
  // When the document stops being valid (DBS, passport, visa, insurance).
  // Null for the majority, which never expire.
  expiresAt?: string | null;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  uploadedById?: string | null;
}

export const documentsApi = {
  config: () => api.get<{ configured: boolean }>('/documents/config').then((r) => r.data),
  list: (ownerType: DocumentOwnerType, ownerId: string) =>
    api.get<DocumentMeta[]>('/documents', { params: { ownerType, ownerId } }).then((r) => r.data),
  upload: (ownerType: DocumentOwnerType, ownerId: string, file: File, category?: string, expiresAt?: string) => {
    const fd = new FormData();
    fd.append('ownerType', ownerType);
    fd.append('ownerId', ownerId);
    if (category) fd.append('category', category);
    if (expiresAt) fd.append('expiresAt', expiresAt);
    fd.append('file', file);
    return api
      .post<DocumentMeta>('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
  // Set or clear an expiry date on a document already uploaded - most files
  // predate this field, so they need filling in without re-uploading.
  setExpiry: (id: string, expiresAt: string | null) =>
    api.patch<DocumentMeta>(`/documents/${id}`, { expiresAt }).then((r) => r.data),
  downloadUrl: (id: string, inline = false) =>
    api.get<{ url: string }>(`/documents/${id}/download`, { params: inline ? { inline: '1' } : {} }).then((r) => r.data.url),
  remove: (id: string) => api.delete(`/documents/${id}`).then((r) => r.data),
};
