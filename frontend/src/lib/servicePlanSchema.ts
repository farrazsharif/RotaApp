// Schema for the Personal Service Plan assessment form.
// Each item's stored key is `${section.id}.${index}` so values stay stable
// as long as item order within a section is preserved.

export type PspItemType =
  | 'yn' | 'choice' | 'check' | 'text' | 'longtext' | 'capability'
  | 'signature' | 'mhEquipment' | 'equipment';

export interface PspItem {
  label: string;
  type?: PspItemType;       // default 'yn'
  options?: string[];       // for 'choice'
}

export interface PspSection {
  id: string;
  title: string;
  intro?: string;
  note?: string;
  action?: boolean;         // yn rows get an extra "Action" column
  items: PspItem[];
}

const yn = (label: string): PspItem => ({ label, type: 'yn' });

export const PSP_SECTIONS: PspSection[] = [
  {
    id: 'callMonitoring',
    title: 'Call Monitoring Information',
    note: "If the answer to “Would the SU like to be removed from Call Monitoring?” is YES, this must be recorded on a separate spreadsheet and confirmed with the family and Local Authority.",
    items: [
      yn('Does the Service User have a land line telephone?'),
      yn('Will the Service User allow staff to use the telephone to register visits?'),
      yn('Would the Service User like to be removed from Call Monitoring?'),
    ],
  },
  {
    id: 'generalHealth',
    title: 'General Health',
    intro: 'Does the Service User suffer from any of the following?',
    items: [
      yn('Diabetes'), yn('Multiple Sclerosis'), yn("Parkinson’s Disease"), yn('Cancer'),
      yn('Epilepsy'), yn('Heart Problems'), yn('Stroke'), yn('Paralysis / weakness'),
      yn('Substance Misuse'), yn('Falls (if yes, complete risk assessment form)'),
      yn('Alcohol Misuse'), yn('Amputee'), yn('Emphysema'),
      yn('Unpredictable / unstable movement e.g. spasms / fits'),
      yn('Smoking'), yn('Deteriorating Senses'),
      { label: 'Other (please specify)', type: 'text' },
    ],
  },
  {
    id: 'commWritten',
    title: 'Communication — Written Information',
    intro: 'Written information to be supplied in:',
    items: [
      { label: 'Standard Print', type: 'check' },
      { label: 'Large Print', type: 'check' },
      { label: 'Braille', type: 'check' },
      { label: 'Other (please specify)', type: 'check' },
    ],
  },
  {
    id: 'sensory',
    title: 'Sensory Impairment',
    items: [
      yn('None'), yn('Registered Blind'), yn('Slight Visual Impairment (wears glasses)'),
      yn('Registered Deaf'), yn('Slight Hearing Impairment (wears hearing aids)'),
      yn('Hard of hearing (does not wear aids)'),
      { label: 'Other (please specify)', type: 'text' },
    ],
  },
  {
    id: 'verbal',
    title: 'Verbal Communication',
    intro: 'Is the Service User able to:',
    items: [
      yn('Cooperate with staff'), yn('Understand prompts and instructions'),
      yn('Answer the telephone'), yn('Hold a telephone conversation'),
      yn('Does the SU have a speech impediment?'),
      yn('Linguistic Needs (e.g. interpreter, sign language, first language)'),
      { label: 'Other (please specify)', type: 'text' },
    ],
  },
  {
    id: 'financial',
    title: 'Financial',
    items: [
      yn('Is the Service User able to manage the handling of their monies? (for shopping etc.)'),
      yn('Does the SU have access to finances?'),
      yn('Is there money left lying around the home?'),
      yn('Are staff responsible for any cash handling? (e.g. shopping or pension)'),
    ],
  },
  {
    id: 'beliefs',
    title: 'Religious / Cultural / Personal Beliefs or Issues',
    items: [
      yn('Are there any dietary requirements?'),
      yn('Are there any special hair care needs?'),
      yn('Are there any skin / personal care requirements?'),
      yn('Is there any further information due to cultural / personal beliefs and preferences?'),
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment',
    intro: 'Is the following equipment in place?',
    items: [yn('Commode'), yn('Hoist'), yn('Stair Lift'), yn('Walking Aid'), { label: 'Other (please specify)', type: 'text' }],
  },
  {
    id: 'personalCare',
    title: 'Personal Care',
    items: [
      yn('Does the Service User have, or are they at risk of any pressure sores?'),
      yn('Does the SU need assistance with washing?'),
      yn('Does the SU need assistance with Bathing / Showering?'),
      yn('Does the SU need assistance with Tooth / Denture care?'),
      yn('Does the SU need assistance with false limbs?'),
      { label: 'Ability to attend to Personal Care', type: 'choice', options: ['Unaided', 'With Support', 'Dependant'] },
    ],
  },
  {
    id: 'continence',
    title: 'Continence Management',
    items: [
      yn('Is the SU self managing?'), yn('Is there a catheter in situ?'),
      yn('Is there a stoma / colostomy?'), yn('Does the SU use incontinence aids? e.g. pads'),
      yn('Is the SU prone to urine infections?'), { label: 'Other (please specify)', type: 'text' },
    ],
  },
  {
    id: 'food',
    title: 'Food Management',
    items: [
      yn('Does the SU suffer from any allergies?'),
      yn('Is the SU able to do their own shopping?'),
      yn('Is the SU at risk of poor diet / nutrition / fluid intake?'),
      yn('Are staff responsible for checking food dates and disposing of out of date food?'),
      yn('Does the SU have adequate storage facilities?'),
      yn('Does the SU have difficulty in swallowing?'),
      yn('Is the SU at risk of choking?'),
    ],
  },
  {
    id: 'safeguarding',
    title: 'Safeguarding of Vulnerable Adults',
    note: 'Information marked * must be recorded clearly on the system.',
    items: [
      yn('*Is it acceptable to accept cancelled calls directly from the Service User?'),
      yn('*Do cancelled calls need to be verified by family or Local Authority?'),
      yn('Is the SU able to attend groups? (e.g. Social)'),
      yn('Is the SU prone to wandering?'),
      yn('Does the SU have short term memory loss?'),
      yn('Does the SU suffer from anxiety?'),
      yn('Is the SU at risk of self-neglect?'),
      yn('Is the SU at risk of self-harm?'),
      yn('Ability to have voice heard?'),
      yn('Is the SU able to promote their own independence?'),
      { label: 'Level of vulnerability', type: 'choice', options: ['High', 'Medium', 'Low'] },
    ],
  },
  {
    id: 'medObtaining',
    title: 'Medication — Obtaining',
    action: true,
    items: [
      yn('Is the SU able to obtain their own medication?'),
      yn('Are family responsible for obtaining the medication?'),
      yn('Is the delivery of medication part of the care plan for carers to complete?'),
      { label: 'Where is the medication stored?', type: 'text' },
      { label: 'Is there a locked storage system? (if yes, do not record numbers in SU home file)', type: 'text' },
      { label: 'Is the medication correctly stored?', type: 'text' },
      { label: 'Is there other medication stored in the home (e.g. spouse’s) which may lead to confusion / error?', type: 'text' },
      { label: 'Is the medication in blister packs, original packaging or a mixture of the two?', type: 'text' },
    ],
  },
  {
    id: 'medTaking',
    title: 'Medication — Taking',
    action: true,
    items: [
      yn('Is the SU able to read the label on the medication?'),
      yn('Is the SU able to remove the medication from its bottle, container or packet?'),
      yn('Are family members responsible for managing the SU’s medication?'),
      yn('Does the SU have difficulties in swallowing the medication?'),
      yn('If the SU is diabetic, is this controlled through medication?'),
      yn('Does the SU need prompting or reminding?'),
      yn('Does the SU need assistance?'),
      yn('Does the SU need medication administered?'),
      yn('Does the SU need controlled administration?'),
    ],
  },
  {
    id: 'medTopical',
    title: 'Medication — Applying Topical Applications',
    action: true,
    items: [
      yn('Does the SU require assistance when applying creams / ointments?'),
      yn('Can the SU apply eye drops independently?'),
      yn('Can the SU use their inhaler / nebuliser independently?'),
      yn('If oxygen is in place, can the SU use this independently?'),
    ],
  },
  {
    id: 'medHealthTask',
    title: 'Medication — Health Care Task',
    action: true,
    items: [
      yn('If catheter in place, can SU empty the day / night bags independently?'),
      yn('If stoma bag is in place, can SU take care of this independently?'),
      yn('Is the District Nurse involved in any health related tasks?'),
      yn('Any known allergies?'),
      yn('Any known side effects?'),
      yn('Are there any cultural or religious requirements that may affect how Care Workers undertake medication tasks?'),
      { label: 'Any other comments', type: 'longtext' },
    ],
  },
  {
    id: 'handlingConstraints',
    title: 'Manual Handling — Handling Constraints',
    note: 'Any identified risks must have a risk assessment completed.',
    items: [
      yn('Skin Lesions'), yn('Pain'), yn('Infusions'), yn('Risk of Pressure Sores'),
      yn('Weight bearing'), yn('Disability'), yn('Communication Problems'),
      { label: 'Other', type: 'text' },
    ],
  },
  {
    id: 'capabilities',
    title: 'Manual Handling — Capabilities',
    items: [
      { label: 'To bed', type: 'capability' }, { label: 'From bed', type: 'capability' },
      { label: 'Movement in bed', type: 'capability' }, { label: 'Walking', type: 'capability' },
      { label: 'Chair to stand', type: 'capability' }, { label: 'Washing', type: 'capability' },
      { label: 'Showering / Bathing', type: 'capability' }, { label: 'Toilet', type: 'capability' },
      { label: 'On and off transport', type: 'capability' }, { label: 'Outdoor mobility', type: 'capability' },
      { label: 'Other', type: 'capability' },
    ],
  },
  {
    id: 'environmental',
    title: 'Manual Handling — Environmental Risks',
    intro: 'Is it difficult to manoeuvre the Service User because of:',
    note: 'If yes, give details and complete a risk assessment.',
    items: [
      yn('A lack of space'), yn('Poor floor surface'), yn('Furniture unsuitable (e.g. height)'),
      { label: 'Other', type: 'text' },
    ],
  },
  {
    id: 'manualHandlingCase',
    title: 'Manual Handling — Overall Case',
    items: [
      { label: 'Overall the Manual Handling case is', type: 'choice', options: ['Simple', 'Moderately Difficult', 'Difficult', 'Physically Demanding'] },
      yn('Is there a need for further action to reduce the risk from Moving and Handling? (if yes, complete action plan)'),
    ],
  },
  {
    id: 'mhEquipment',
    title: 'Moving & Handling Equipment',
    items: [
      { label: 'Equipment in place', type: 'mhEquipment' },
    ],
  },
  {
    id: 'equipmentServicing',
    title: 'Equipment — Supply & Servicing',
    intro: 'Record who supplied each item of equipment and who is responsible for servicing it.',
    items: [
      { label: 'Equipment 1', type: 'equipment' },
      { label: 'Equipment 2', type: 'equipment' },
    ],
  },
  {
    id: 'actionPlan',
    title: 'Action Plan',
    intro: 'Tick any action required and record details, including the date carried out.',
    items: [
      { label: 'Request family to alter environment', type: 'check' },
      { label: 'Request for equipment', type: 'check' },
      { label: 'Request for assessment from OT / Other', type: 'check' },
      { label: 'Request review of Service User needs', type: 'check' },
      { label: 'Other', type: 'check' },
      { label: 'Assessor signature', type: 'signature' },
      { label: 'Service User / Representative signature', type: 'signature' },
    ],
  },
  {
    id: 'lastWishes',
    title: 'Last Wishes',
    items: [
      yn('I have a funeral plan in place'),
      yn('I have a DNACPR in place'),
      yn('If I become unwell, I wish to be supported at home'),
      { label: 'Details of support required / where documentation is kept', type: 'longtext' },
    ],
  },
  {
    id: 'consent',
    title: 'Consent & Sign-off',
    items: [
      yn('Client consents to receiving these services and to information being shared on a need-to-know basis'),
      { label: 'If unable to give agreement, give details (reasons / others consulted)', type: 'longtext' },
      { label: 'Assessor name', type: 'text' },
      { label: 'Assessor role', type: 'text' },
      { label: 'Assessment date', type: 'text' },
      { label: 'Client signature', type: 'signature' },
      { label: 'Assessor signature', type: 'signature' },
    ],
  },
];

export const itemKey = (sectionId: string, idx: number) => `${sectionId}.${idx}`;

// Value shapes per type:
//  yn        -> { v: 'YES'|'NO'|'', comment: string, action?: string }
//  choice    -> string (selected option)
//  check     -> { checked: boolean, comment: string }
//  text      -> string
//  longtext  -> string
//  capability-> { independent: boolean, supervise: boolean, staff: string, aid: string }
//  signature -> { dataUrl: string, name: string, date: string }
//  mhEquipment -> { turnplate, slideSheet, handlingBelt, rotunder, other: boolean;
//                   hoistModel, bathHoistModel, standAidModel, otherDetail: string }
//  equipment -> { suppliedBy, servicingBy: string; contractorNumber, make, model, serviceNo, lastService, nextDue: string }
export type PspValues = Record<string, unknown>;
