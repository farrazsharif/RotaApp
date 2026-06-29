export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  hourlyRate: number;
  phone?: string | null;
  active: boolean;
}

export interface ServiceUserBrief {
  id: string;
  firstName: string;
  lastName: string;
  address?: string | null;
  postcode?: string | null;
  phone?: string | null;
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
  visitDuration: number;
  visits?: string | null;
  active: boolean;
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

export interface PersonalServicePlan {
  id: string;
  serviceUserId: string;
  data: string;
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
  applicationSites: string;
  active: boolean;
}

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

export interface Shift {
  id: string;
  userId?: string | null;
  serviceUserId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  visitName?: string | null;
  cover: number;
  role?: string | null;
  notes?: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'SWAPPED';
  user?: User | null;
  coverCarers?: User[];
  serviceUser?: ServiceUserBrief | null;
  clockRecords?: { id: string; userId: string; clockIn: string; clockOut: string | null }[];
}

export interface ClockRecord {
  id: string;
  userId: string;
  shiftId?: string | null;
  clockIn: string;
  clockOut?: string | null;
}

export interface CallLog {
  id: string;
  shiftId?: string | null;
  serviceUserId: string;
  userId?: string | null;
  note: string;
  createdAt: string;
}

export type MedAdminStatus = 'GIVEN' | 'REFUSED' | 'MISSED' | 'NOT_NEEDED' | 'SELF_ADMIN';

export interface DueDose {
  medicationId: string;
  name: string;
  dose?: string | null;
  route?: string | null;
  time: string;
  scheduledFor: string;
  status: MedAdminStatus | null;
  recordedAt: string | null;
}
