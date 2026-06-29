export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'FAMILY_MEMBER' | 'ADMIN';
  active: boolean;
}

export interface ServiceUser {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  site?: { id: string; name: string; color: string } | null;
  nhsNumber?: string | null;
  address?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  gpName?: string | null;
  gpPractice?: string | null;
  gpPhone?: string | null;
  gpAddress?: string | null;
  pharmacyName?: string | null;
  pharmacyPhone?: string | null;
  pharmacyAddress?: string | null;
  needsMedication: boolean;
  needsMobility: boolean;
  needsPersonalCare: boolean;
  careNotes?: string | null;
  relation?: string | null;
}

export interface CarePlan {
  id: string;
  serviceUserId: string;
  schedule: string;
  tasksMorning?: string | null;
  tasksLunch?: string | null;
  tasksTea?: string | null;
  tasksBed?: string | null;
  numberOfCarers?: string | null;
  carePackageInfo?: string | null;
  otherNotes?: string | null;
  reviewDate?: string | null;
  updatedAt: string;
}

export interface Medication {
  id: string;
  serviceUserId: string;
  name: string;
  dose?: string | null;
  route?: string | null;
  instructions?: string | null;
  times: string;
  active: boolean;
}

export type MedAdminStatus = 'GIVEN' | 'REFUSED' | 'MISSED' | 'NOT_NEEDED' | 'SELF_ADMIN';

export interface MedAdministration {
  id: string;
  medicationId: string;
  serviceUserId: string;
  userId?: string | null;
  user?: { id: string; firstName: string; lastName: string } | null;
  medication?: { id: string; name: string; dose?: string | null; route?: string | null };
  scheduledFor: string;
  status: MedAdminStatus;
  note?: string | null;
  recordedAt: string;
}

export interface CallLog {
  id: string;
  serviceUserId: string;
  userId?: string | null;
  user?: { id: string; firstName: string; lastName: string } | null;
  note: string;
  createdAt: string;
}
