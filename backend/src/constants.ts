// SQLite does not support native enums, so we model them as string unions here.

export const Role = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE', FAMILY_MEMBER: 'FAMILY_MEMBER' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ShiftStatus = {
  SCHEDULED: 'SCHEDULED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', SWAPPED: 'SWAPPED',
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

export const TradeStatus = {
  PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED', APPROVED: 'APPROVED', CANCELLED: 'CANCELLED',
} as const;
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

export const TimeOffType = {
  VACATION: 'VACATION', SICK: 'SICK', PERSONAL: 'PERSONAL', OTHER: 'OTHER',
} as const;
export type TimeOffType = (typeof TimeOffType)[keyof typeof TimeOffType];

export const RequestStatus = {
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const MedStatus = {
  GIVEN: 'GIVEN', REFUSED: 'REFUSED', MISSED: 'MISSED', NOT_NEEDED: 'NOT_NEEDED', SELF_ADMIN: 'SELF_ADMIN',
} as const;
export type MedStatus = (typeof MedStatus)[keyof typeof MedStatus];
