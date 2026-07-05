import api from '../lib/axios';
import { CustomRole, PermissionKey, Role } from '../types';

export interface RoleInput {
  name: string;
  baseType: Role;
  permissions: PermissionKey[];
}

export const rolesApi = {
  list: () => api.get<CustomRole[]>('/roles').then((r) => r.data),
  create: (data: RoleInput) => api.post<CustomRole>('/roles', data).then((r) => r.data),
  update: (id: string, data: Partial<RoleInput>) => api.put<CustomRole>(`/roles/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/roles/${id}`).then((r) => r.data),
};
