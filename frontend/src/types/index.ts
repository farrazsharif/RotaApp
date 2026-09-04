export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'FAMILY_MEMBER';
// User-facing label for a base role. The EMPLOYEE base type is shown as "Carer"
// (the role value stays EMPLOYEE in code and the API).
export const roleLabel = (role: Role): string => (role === 'EMPLOYEE' ? 'Carer' : role);
export type ShiftStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'SWAPPED';
export type TimeOffType = 'VACATION' | 'SICK' | 'PERSONAL' | 'OTHER';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type NotificationType =
  | 'SHIFT_ASSIGNED' | 'SHIFT_UPDATED' | 'SHIFT_CANCELLED' | 'SHIFT_PUBLISHED' | 'SHIFT_REMOVED'
  | 'TIME_OFF_APPROVED' | 'TIME_OFF_REJECTED' | 'CLOCK_REMINDER';

export type PermissionKey =
  | 'manage_staff' | 'delete_staff' | 'reset_staff_passwords' | 'manage_family_access'
  | 'manage_service_users' | 'manage_reviews' | 'manage_medications' | 'edit_call_logs'
  | 'manage_supervision'
  | 'manage_schedule' | 'manage_time_off' | 'view_reports'
  | 'manage_cqc'
  | 'manage_billing'
  | 'manage_sites' | 'manage_settings' | 'manage_permissions' | 'reset_test_data' | 'view_audit_log';

export interface AuditLog {
  id: string;
  actorName: string;
  actorFullName?: string | null;
  action: string;
  target?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  group: string;
  default: Role[];
  protectedAdmin?: boolean;
}

export type PermissionMap = Partial<Record<PermissionKey, Role[]>>;

export interface CustomRole {
  id: string;
  name: string;
  baseType: Role;
  permissions: PermissionKey[];
  userCount: number;
}

export interface PermissionsResponse {
  definitions: PermissionDef[];
  permissions: Record<PermissionKey, Role[]>;
}

export interface OrgSettings {
  id: string;
  companyName: string;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  cqcProviderId?: string | null;
  icoNumber?: string | null;
  timezone: string;
  defaultHourlyRate: number;
  overtimeThreshold: number;
  inviteExpiryDays: number;
  defaultRole: Role;
  callLogTasks?: string | null; // JSON array of carer-app visit checklist task defs
  staffFileRequirements?: string | null; // JSON array of editable staff-file compliance requirements
  trainingCourses?: string | null; // JSON array of editable training-course names
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  hourlyRate: number;
  phone?: string;
  photo?: string;
  active: boolean;
  platformAdmin?: boolean; // platform owner — sees the cross-company admin area
  pendingSetup?: boolean; // invited but hasn't set a password yet
  customRoleId?: string | null;
  customRole?: { id: string; name: string; baseType: Role } | null;
  capabilities?: PermissionKey[]; // effective capabilities (from /auth/me or staff page)
  permissionsOverride?: PermissionKey[] | null; // per-person override (null = follow role)
  sites?: { id: string; name: string; color: string }[]; // scoped sites (empty = org-wide)
  staffType?: 'LOCAL' | 'OVERSEAS'; // recruitment category
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  emergencyContactAddress?: string;
  fitForWork?: FitForWork | null;
  createdAt: string;
}

export type YesNo = 'YES' | 'NO' | '';

// Staff "Fit for Work" health declaration (matches the paper form). Stored as
// a single JSON blob on the User record.
export interface FitForWork {
  conditions?: Record<string, YesNo>; // keyed by condition id (see FIT_FOR_WORK_CONDITIONS)
  conditionsDetails?: string;
  spectacles?: string;
  medication?: string;
  illness?: string;
  restrictions?: YesNo;
  restrictionsDetails?: string;
  signature?: string; // drawn signature as a data URL
  signedName?: string;
  signedDate?: string; // yyyy-MM-dd
  updatedAt?: string; // ISO timestamp of last save
}

export interface Shift {
  id: string;
  userId?: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>;
  seriesId?: string;
  serviceUserId?: string;
  serviceUser?: { id: string; firstName: string; lastName: string; address?: string; postcode?: string; status?: ServiceUserStatus; statusUpdatedAt?: string; statusChanges?: { status: ServiceUserStatus; effectiveAt: string }[]; site?: Site };
  date: string;
  startTime: string;
  endTime: string;
  visitName?: string;
  cover: number;
  coverCarers?: Pick<User, 'id' | 'firstName' | 'lastName'>[];
  role?: string;
  notes?: string;
  givesMedication?: boolean;
  status: ShiftStatus;
  published: boolean;
  createdAt: string;
  runId?: string | null;
  run?: { id: string; name: string; color?: string | null } | null;
  cancelBillable?: boolean;
  cancelChargeType?: 'FULL' | 'PERCENT' | 'CUSTOM' | null;
  cancelChargePercent?: number | null;
  cancelChargeAmount?: number | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
}

export interface Run {
  id: string;
  name: string;
  color?: string | null;
  order: number;
  active: boolean;
  carers: Pick<User, 'id' | 'firstName' | 'lastName'>[];
  upcomingCount?: number;
  createdAt?: string;
}

export type ReviewAnswer = 'YES' | 'NO' | 'NA' | '';
export type ReviewType = 'SIX_WEEK' | 'QUARTERLY';

export interface ReviewOutcome {
  action: string;
  outcome: string;
  timescale: string;
  actionBy: string;
  completion: string;
}

export interface Review {
  id: string;
  serviceUserId: string;
  serviceUser?: Pick<ServiceUser, 'id' | 'firstName' | 'lastName'>;
  type: ReviewType;
  reviewDate: string;
  nextReviewDate?: string;
  assessorName?: string;
  answers: string; // JSON: { [questionId]: { answer, comment } }
  otherInfo?: string;
  outcomes: string; // JSON: ReviewOutcome[]
  representativeName?: string;
  phoneConsent: boolean;
  source?: string | null; // 'form' | 'paper'
  createdAt: string;
  updatedAt: string;
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

export interface CallLogSignature {
  userId: string;
  firstName: string;
  lastName: string;
  signedAt: string;
}

export interface CallLog {
  id: string;
  note: string;
  createdAt: string;
  tasks?: string | null; // JSON array of ticked checklist tasks
  signedBy?: string | null; // JSON array of CallLogSignature
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

export type MedStatus = 'GIVEN' | 'REFUSED' | 'MISSED' | 'NOT_NEEDED' | 'SELF_ADMIN' | 'CANCELLED';
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
  isBlisterPack?: boolean;
  packContents?: string;
  times: string; // JSON array of "HH:MM"
  daysOfWeek?: string; // JSON array of weekday numbers 0-6 (0=Sun); empty = every day
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
  order?: number;
  supportedLiving?: boolean;
  housingProvider?: string | null;
  housingOfficerName?: string | null;
  housingOfficerPhone?: string | null;
  housingOfficerEmail?: string | null;
  _count?: { serviceUsers: number };
}

export type FunderType = 'COUNCIL' | 'PRIVATE' | 'NHS_CHC';

export interface Funder {
  id: string;
  name: string;
  type: FunderType;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  poReference?: string | null;
  paymentTermsDays: number;
  vatExempt: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { fundingArrangements: number };
}

export interface FundingArrangement {
  id: string;
  serviceUserId: string;
  funderId: string;
  funder?: Funder;
  serviceUser?: Pick<ServiceUser, 'id' | 'firstName' | 'lastName' | 'status'>;
  billingUnit: 'PER_HOUR';
  rate: number; // base/weekday charge per hour to the funder (revenue, not carer pay)
  weekendRate?: number | null; // charge per hour on Sat/Sun; null = use base rate
  bankHolidayRate?: number | null; // charge per hour on bank holidays; null = use base rate
  sharePercent?: number; // % of each visit billed to this funder (split funding)
  allocation: string;
  startDate?: string | null;
  endDate?: string | null;
  poNumber?: string | null;
  contractRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankHoliday {
  id: string;
  date: string;
  name: string;
  createdAt: string;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'VOID';

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  serviceUserId?: string | null;
  serviceUser?: Pick<ServiceUser, 'id' | 'firstName' | 'lastName'> | null;
  sourceShiftId?: string | null;
  date: string;
  description: string;
  quantity: number; // carer-hours
  unitRate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  funderId: string;
  funder?: Pick<Funder, 'id' | 'name' | 'type' | 'billingAddress' | 'paymentTermsDays' | 'vatExempt'>;
  number?: string | null;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  issueDate?: string | null;
  dueDate?: string | null;
  subtotal: number;
  vat: number;
  total: number;
  poNumber?: string | null;
  notes?: string | null;
  lines?: InvoiceLine[];
  payments?: Payment[];
  amountPaid?: number;
  outstanding?: number;
  _count?: { lines: number };
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  date: string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AgedDebt {
  buckets: { current: number; days30: number; days60: number; days90: number };
  totalOutstanding: number;
  rows: {
    id: string;
    number?: string | null;
    funder?: string;
    dueDate?: string | null;
    total: number;
    paid: number;
    outstanding: number;
    daysOverdue: number;
  }[];
}

export type PlacementNightType = 'SLEEP_IN' | 'WAKING';
export type PlacementStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Placement {
  id: string;
  serviceUserId: string;
  carerId: string;
  startDate: string; // ISO (date-only, midnight)
  endDate: string;   // ISO (inclusive last day)
  nightType: PlacementNightType;
  status: PlacementStatus;
  note?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceUser {
  id: string;
  firstName: string;
  lastName: string;
  title?: string;
  preferredName?: string;
  gender?: string;
  ethnicOrigin?: string;
  dateOfBirth: string;
  serviceStartDate?: string;
  careType?: 'DOMICILIARY' | 'SUPPORTED_LIVING';
  housingProvider?: string;
  housingScheme?: string;
  housingOfficerName?: string;
  housingOfficerPhone?: string;
  housingOfficerEmail?: string;
  tenancyStartDate?: string;
  tenancyRef?: string;
  photo?: string;
  siteId?: string;
  site?: Site;
  nhsNumber?: string;
  packageId?: string;
  grabSheet?: string;
  address?: string;
  postcode?: string;
  keySafe?: string;
  medsSafeCode?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactMobile?: string;
  emergencyContactAddress?: string;
  emergencyContactRelation?: string;
  emergencyContactEmail?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinMobile?: string;
  nextOfKinAddress?: string;
  nextOfKinRelation?: string;
  nextOfKinEmail?: string;
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
  contractedWeeklyHours?: number | null;
  visitDuration: number;
  visits?: string; // JSON array of { type, duration }
  supportCategories?: string; // JSON array of CQC PIR category labels
  active: boolean;
  status: ServiceUserStatus;
  statusUpdatedAt?: string;
  preferredCaregivers: Pick<User, 'id' | 'firstName' | 'lastName'>[];
  createdAt: string;
}

export type ServiceUserStatus = 'ACTIVE' | 'ON_HOLD' | 'HOSPITALISED' | 'DISCHARGED' | 'DECEASED';

export interface CarePlan {
  id: string;
  serviceUserId: string;
  schedule: string; // JSON: { Monday: { morning, lunch, tea, bed }, ... }
  extraCalls?: string; // JSON array of { name, when }
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

export interface LikesDislikes {
  id: string;
  serviceUserId: string;
  likes?: string;
  dislikes?: string;
  lifeHistory?: string;
  health?: string;
  whatPeopleLike?: string;
  relationships?: string;
  goodDay?: string;
  badDay?: string;
  paperMeta?: string | null; // JSON PaperMeta when held on paper
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

export interface Training {
  id: string;
  userId: string;
  course: string;
  date: string;
  expiresAt?: string;
  accredited: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportantDate {
  id: string;
  userId: string;
  label: string;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageDay {
  day: string;
  date: string;
  total: number;
  filled: number;
  pct: number;
}

export interface DashboardStats {
  totalEmployees: number;
  shiftsThisWeek: number;
  pendingTimeOff: number;
  visitsToday: { total: number; completed: number };
  unassignedToday: number;
  lateCheckins: number;
  missedMeds: number;
  expiringCompliance: number;
  coverage: CoverageDay[];
}
