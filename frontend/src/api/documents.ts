import api from '../lib/axios';

export type DocumentOwnerType = 'USER' | 'SERVICE_USER';

export interface DocumentMeta {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category?: string | null;
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
  upload: (ownerType: DocumentOwnerType, ownerId: string, file: File, category?: string) => {
    const fd = new FormData();
    fd.append('ownerType', ownerType);
    fd.append('ownerId', ownerId);
    if (category) fd.append('category', category);
    fd.append('file', file);
    return api
      .post<DocumentMeta>('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
  downloadUrl: (id: string, inline = false) =>
    api.get<{ url: string }>(`/documents/${id}/download`, { params: inline ? { inline: '1' } : {} }).then((r) => r.data.url),
  remove: (id: string) => api.delete(`/documents/${id}`).then((r) => r.data),
};
