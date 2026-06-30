export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'FAMILY_MEMBER';
export type ShiftStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'SWAPPED';
export type TradeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'APPROVED' | 'CANCELLED';
export type TimeOffType = 'VACATION' | 'SICK' | 'PERSONAL' | 'OTHER';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type NotificationType =
  | 'SHIFT_ASSIGNED' | 'SHIFT_UPDATED' | 'SHIFT_CANCELLED' | 'SHIFT_PUBLISHED' | 'SHIFT_REMOVED'
  | 'TRADE_REQUEST' | 'TRADE_ACCEPTED' | 'TRADE_REJECTED' | 'TRADE_APPROVED'
  | 'TIME_OFF_APPROVED' | 'TIME_OFF_REJECTED' | 'CLOCK_REMINDER';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  hourlyRate: number;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export interface Shift {
  id: string;
  userId?: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>;
  seriesId?: string;
  serviceUserId?: string;
  serviceUser?: { id: string; firstName: string; lastName: string; address?: string; postcode?: string; status?: ServiceUserStatus; site?: Site };
  date: string;
  startTime: string;
  endTime: string;
  visitName?: string;
  cover: number;
  coverCarers?: Pick<User, 'id' | 'firstName' | 'lastName'>[];
  role?: string;
  notes?: string;
  status: ShiftStatus;
  published: boolean;
  createdAt: string;
}

export interface ShiftTrade {
  id: string;
  requesterId: string;
  requester: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
  targetUserId?: string;
  targetUser?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
  shiftId: string;
  shift: Shift;
  targetShiftId?: string;
  targetShift?: Shift;
  message?: string;
  status: TradeStatus;
  createdAt: string;
}

export interface TimeOffRequest {
  id: string;
  userId: string;
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
  startDate: string;
  endDate: string;
  type: TimeOffType;
  reason?: string;
  status: RequestStatus;
  createdAt: string;
}

export interface ClockRecord {
  id: string;
  userId: string;
  user: Pick<User, 'id' | 'firstName' | 'lastName'>;
  shiftId?: string;
  shift?: Shift;
  clockIn: string;
  clockOut?: string;
  createdAt: string;
}

export interface CallLog {
  id: string;
  note: string;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  serviceUser?: Pick<ServiceUser, 'id' | 'firstName' | 'lastName'>;
  shift?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    visitName?: string;
    clockRecords?: { userId: string; clockIn: string; clockOut?: string }[];
  };
}

export type MedStatus = 'GIVEN' | 'REFUSED' | 'MISSED' | 'NOT_NEEDED' | 'SELF_ADMIN';
export type BodyMapView = 'front' | 'back';
export interface BodyMapPoint {
  view: BodyMapView;
  x: number; // % of diagram width
  y: number; // % of diagram height
  label?: string;
}

export interface Medication {
  id: string;
  serviceUserId: string;
  name: string;
  dose?: string;
  route?: string;
  instructions?: string;
  times: string; // JSON array of "HH:MM"
  applicationSites: string; // JSON array of BodyMapPoint
  startDate?: string;
  endDate?: string;
  active: boolean;
  createdAt: string;
}

export interface MedAdministration {
  id: string;
  medicationId: string;
  serviceUserId: string;
  userId?: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  medication?: { id: string; name: string; dose?: string; route?: string };
  serviceUser?: Pick<ServiceUser, 'id' | 'firstName' | 'lastName'>;
  scheduledFor: string;
  status: MedStatus;
  note?: string;
  recordedAt: string;
}

export interface DueDose {
  medicationId: string;
  name: string;
  dose?: string;
  route?: string;
  time: string;
  scheduledFor: string;
  status: MedStatus | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  color: string;
  _count?: { serviceUsers: number };
}

export interface ServiceUser {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  siteId?: string;
  site?: Site;
  nhsNumber?: string;
  address?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  gpName?: string;
  gpPractice?: string;
  gpPhone?: string;
  gpAddress?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyAddress?: string;
  needsMedication: boolean;
  needsMobility: boolean;
  needsPersonalCare: boolean;
  careNotes?: string;
  visitDuration: number;
  visits?: string; // JSON array of { type, duration }
  active: boolean;
  status: ServiceUserStatus;
  preferredCaregivers: Pick<User, 'id' | 'firstName' | 'lastName'>[];
  createdAt: string;
}

export type ServiceUserStatus = 'ACTIVE' | 'ON_HOLD' | 'HOSPITALISED' | 'DISCHARGED' | 'DECEASED';

export interface CarePlan {
  id: string;
  serviceUserId: string;
  schedule: string; // JSON: { Monday: { morning, lunch, tea, bed }, ... }
  tasksMorning?: string;
  tasksLunch?: string;
  tasksTea?: string;
  tasksBed?: string;
  numberOfCarers?: string;
  carePackageInfo?: string;
  otherNotes?: string;
  reviewDate?: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyLink {
  id: string;
  userId: string;
  serviceUserId: string;
  relation?: string;
  createdAt: string;
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'active'>;
  serviceUser: Pick<ServiceUser, 'id' | 'firstName' | 'lastName'>;
}

export interface DashboardStats {
  totalEmployees: number;
  shiftsThisWeek: number;
  pendingTimeOff: number;
  pendingTrades: number;
}
