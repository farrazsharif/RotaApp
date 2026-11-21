import api from '../lib/axios';

// The areas the runner can build from data. The rest are recorded by hand.
export const RUNNABLE_AUDITS = ['CARE_PLAN', 'MAR', 'RECRUITMENT_FILE', 'CALL_MONITORING'];

export const AUDIT_TYPES: { key: string; label: string }[] = [
  { key: 'CARE_PLAN', label: 'Care plans' },
  { key: 'MAR', label: 'MAR charts' },
  { key: 'DAILY_NOTES', label: 'Daily notes' },
  { key: 'RECRUITMENT_FILE', label: 'Recruitment files' },
  { key: 'CALL_MONITORING', label: 'Call monitoring' },
  { key: 'MEDICATION', label: 'Medication' },
  { key: 'SAFEGUARDING', label: 'Safeguarding' },
  { key: 'IPC', label: 'Infection prevention' },
  { key: 'HEALTH_SAFETY', label: 'Health & safety' },
  { key: 'COMPLAINTS', label: 'Complaints' },
  { key: 'OTHER', label: 'Other' },
];

export const ACTION_SOURCES: { key: string; label: string }[] = [
  { key: 'AUDIT', label: 'An audit' },
  { key: 'COMPLAINT', label: 'A complaint' },
  { key: 'SAFEGUARDING', label: 'A safeguarding concern' },
  { key: 'INCIDENT', label: 'An incident' },
  { key: 'FEEDBACK', label: 'Feedback' },
  { key: 'INSPECTION', label: 'An inspection' },
  { key: 'OTHER', label: 'Something else' },
];

export const PRIORITIES: { key: string; label: string }[] = [
  { key: 'HIGH', label: 'High' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'LOW', label: 'Low' },
];

export type AuditStatus = 'OPEN' | 'COMPLETE';
export type ActionStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

interface Person { id: string; firstName: string; lastName: string }

export interface Audit {
  id: string;
  type: string;
  title: string | null;
  scope: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  auditedAt: string;
  score: number | null;
  maxScore: number | null;
  findings: string | null;
  nextDueDate: string | null;
  status: AuditStatus;
  createdAt: string;
  auditedBy?: Person | null;
  _count: { actions: number };
}

export interface AuditDetail extends Audit {
  attachments: string;
  updatedAt: string;
  actions: ImprovementAction[];
}

export interface ImprovementAction {
  id: string;
  title: string;
  detail: string | null;
  source: string;
  auditId: string | null;
  dueDate: string | null;
  priority: string;
  status: ActionStatus;
  evidence: string | null;
  completedAt: string | null;
  createdAt: string;
  owner?: Person | null;
  createdBy?: Person | null;
  completedBy?: Person | null;
  audit?: { id: string; type: string; title: string | null } | null;
}

export interface AuditInput {
  type?: string;
  title?: string | null;
  scope?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  auditedAt?: string | null;
  score?: number | null;
  maxScore?: number | null;
  findings?: string | null;
  nextDueDate?: string | null;
  status?: AuditStatus;
}

export interface ActionInput {
  title?: string;
  detail?: string | null;
  source?: string;
  auditId?: string | null;
  ownerId?: string | null;
  dueDate?: string | null;
  priority?: string;
  status?: ActionStatus;
  evidence?: string | null;
}

export const auditTypeLabel = (key: string) => AUDIT_TYPES.find((t) => t.key === key)?.label || key;
export const sourceLabel = (key: string) => ACTION_SOURCES.find((s) => s.key === key)?.label || key;

export const governanceApi = {
  audits: (params?: { type?: string; status?: string }) =>
    api.get<Audit[]>('/governance/audits', { params }).then((r) => r.data),
  audit: (id: string) => api.get<AuditDetail>(`/governance/audits/${id}`).then((r) => r.data),
  createAudit: (body: AuditInput) => api.post<Audit>('/governance/audits', body).then((r) => r.data),
  // The counting half of an audit, built from data Caremid already holds.
  // Comes back OPEN with its improvement actions already raised.
  runAudit: (type: string) =>
    api.post<{ audit: Audit; actionsCreated: number }>('/governance/audits/run', { type }).then((r) => r.data),
  updateAudit: (id: string, body: AuditInput) =>
    api.patch<Audit>(`/governance/audits/${id}`, body).then((r) => r.data),
  removeAudit: (id: string) => api.delete(`/governance/audits/${id}`).then((r) => r.data),

  actions: (params?: { status?: string; source?: string; open?: boolean; auditId?: string }) =>
    api.get<ImprovementAction[]>('/governance/actions', { params }).then((r) => r.data),
  createAction: (body: ActionInput) =>
    api.post<ImprovementAction>('/governance/actions', body).then((r) => r.data),
  updateAction: (id: string, body: ActionInput) =>
    api.patch<ImprovementAction>(`/governance/actions/${id}`, body).then((r) => r.data),
  removeAction: (id: string) => api.delete(`/governance/actions/${id}`).then((r) => r.data),
};
