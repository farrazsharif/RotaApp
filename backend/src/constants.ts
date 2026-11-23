// SQLite does not support native enums, so we model them as string unions here.

export const Role = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE', FAMILY_MEMBER: 'FAMILY_MEMBER' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ShiftStatus = {
  SCHEDULED: 'SCHEDULED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', SWAPPED: 'SWAPPED',
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

export const TimeOffType = {
  VACATION: 'VACATION', SICK: 'SICK', PERSONAL: 'PERSONAL', OTHER: 'OTHER',
} as const;
export type TimeOffType = (typeof TimeOffType)[keyof typeof TimeOffType];

export const RequestStatus = {
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const MedStatus = {
  GIVEN: 'GIVEN', REFUSED: 'REFUSED', MISSED: 'MISSED', NOT_NEEDED: 'NOT_NEEDED', SELF_ADMIN: 'SELF_ADMIN', CANCELLED: 'CANCELLED',
  // The client was on a hospital ward when the dose fell due, or was out
  // when the carer attended. Each has its own code because neither is a
  // missed dose: MISSED means the dose was due, somebody should have given
  // it, and it was not. MISSED is the only status counted as missed
  // medication, so everything that is not that needs somewhere else to go.
  HOSPITAL: 'HOSPITAL', NOT_AT_HOME: 'NOT_AT_HOME',
  // A relative gave it. The dose WAS taken, so this is not a failure and
  // not a gap - but it was not us who gave it, and a MAR that says our
  // carer administered a dose a daughter handed over is wrong about who is
  // accountable for it.
  FAMILY: 'FAMILY',
  // The medicine was not in the house: the pharmacy had not delivered it.
  // The dose was still not taken, so this is a real gap in the person's
  // treatment - but the carer could not have given what was not there, and
  // the action it calls for is chasing a supplier, not retraining a carer.
  // Kept out of MISSED for that reason, and surfaced on its own Reg 12
  // check so it cannot be used to make a supply failure disappear.
  AWAITING_DELIVERY: 'AWAITING_DELIVERY',
} as const;
export type MedStatus = (typeof MedStatus)[keyof typeof MedStatus];

export const ServiceUserStatus = {
  ACTIVE: 'ACTIVE', ON_HOLD: 'ON_HOLD', HOSPITALISED: 'HOSPITALISED', DISCHARGED: 'DISCHARGED', DECEASED: 'DECEASED',
} as const;
export type ServiceUserStatus = (typeof ServiceUserStatus)[keyof typeof ServiceUserStatus];
