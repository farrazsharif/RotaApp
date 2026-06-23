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
}
