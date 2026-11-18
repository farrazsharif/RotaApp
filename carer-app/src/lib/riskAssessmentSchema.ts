// AUTO-BUILT from Care 24 form 03-3-006 "Risk Assessment - Workplace Environment
// (Service User Property)". Each hazard item is scored Low/Med/High with a
// Comment and an Action, mirroring the paper form. Shared shape used by the
// portal (fill/print) and the carer app (read-only).

export type RaItemType = 'risk' | 'hazard' | 'yesno' | 'check' | 'scale' | 'score' | 'text' | 'longtext' | 'date' | 'signature';

export interface RaItem {
  label: string;
  type?: RaItemType; // default 'risk'
  hint?: string;     // optional example / guidance shown under the label
  // 'score' only: the indices, WITHIN THIS SECTION, of the two 'scale' items
  // to multiply together. Positional like every other key here, so never
  // reorder a section that contains one.
  scoreFrom?: [number, number];
}

export interface RaSection {
  id: string;
  title: string;
  intro?: string;
  items: RaItem[];
}

export interface RaForm {
  type: string;   // stable id, e.g. 'ENVIRONMENT'
  title: string;
  formNo?: string;
  sections: RaSection[];
}

// Value stored for a 'risk' item.
export interface RiskVal { level: '' | 'LOW' | 'MED' | 'HIGH'; comment: string; action: string; }

// Value stored for a 'hazard' item (fire-safety style: who's harmed, how it's
// controlled, a H/M/L risk factor, and actions required).
export interface HazardVal { level: '' | 'H' | 'M' | 'L'; whoHarmed: string; controlled: string; actions: string; }

// A 'check' item stores a plain boolean — a ticked box on a list where an
// unticked one means "does not apply", not "unanswered".
// A 'scale' item stores 1-5, or '' before it is set.
// A 'score' item stores nothing: it is computed from the two scales it names.
export type ScaleVal = 1 | 2 | 3 | 4 | 5 | '';

// Bands a likelihood x severity product, matching the paper form's key.
export function scoreBand(total: number): { label: string; tone: 'low' | 'med' | 'high' } {
  if (total >= 13) return { label: 'High', tone: 'high' };
  if (total >= 7) return { label: 'Medium', tone: 'med' };
  return { label: 'Low', tone: 'low' };
}

// Value stored for a 'yesno' item (a Yes/No safety check with a comment).
export interface YesNoVal { v: '' | 'YES' | 'NO'; comment: string; }

// Stable per-item key (schema order is fixed; never reorder existing items).
export const keyForRaItem = (sectionId: string, idx: number): string => `${sectionId}__${idx}`;

export const RA_ENVIRONMENT: RaForm = {
  type: 'ENVIRONMENT',
  title: 'Risk Assessment — Service User Environment',
  formNo: '03-3-006',
  sections: [
  {
    id: 'details',
    title: 'Assessment Details',
    items: [
      { label: 'Service User Reference', type: 'text' },
      { label: 'Risk assessment carried out by', type: 'text' },
      { label: 'Date', type: 'date' },
    ],
  },
  {
    id: "sec1",
    title: "Moving Safely Around the Property",
    items: [
      { label: "Are floors /  stairs damaged, uneven or slippery?" },
      { label: "Are stair rods, clips or other carpet fixings secure and safe?" },
      { label: "Are there loose mats or rugs on polished floors?" },
      { label: "Are floors /  stairs free from clutter and obstacles?" },
      { label: "Are floorboards in sound condition; i.e. not damaged, uneven or broken / missing?" },
      { label: "Are floor coverings clean and in sound condition; i.e. not holed or dangerously worn?" },
      { label: "Is there space for a hoist?" },
      { label: "Are there loose wires or flexes trailing across floors?" },
      { label: "Are banister rails / handrails secure?" },
      { label: "Are hallways and landings adequately lit?" },
      { label: "Do internal doors open and close properly, and lock where needed?" },
      { label: "Does the positioning of furniture present undue hazard or risk?" },
      { label: "Does the positioning of furniture block access to electrical sockets?" },
      { label: "Is furniture in sound condition and free from damage (broken springs, sharp projections etc)?" },
      { label: "Are furniture castors in sound condition; i.e. not broken or stuck which may impede movement?" },
      { label: "Are special grab rails or handles fitted where necessary, and if so are they safe and secure?" },
      { label: "Is the bath / shower cubicle fitted with a rubber mat or other non-slip surface?" },
      { label: "Are door catches, locks and bolts easily reached?" },
      { label: "Are light switches easily reached?" },
      { label: "Are curtains torn or hanging off their runners?" },
      { label: "Are shelves and cupboards easily reached without undue stress, strain or hazard, for example, the need to use steps or a chair?" },
      { label: "Are there any undue infection control issues?" },
      { label: "If there are pets, what are they?" },
      { label: "What arrangements are in place to control pets?" },
      { label: "Are there any perceived risks to Care Workers?" },
      { label: "Are there any special concerns regarding the behaviour of the service user?" },
      { label: "Does the service user have a history of drug or alcohol abuse?" },
      { label: "Does the service user have a history of violence or aggression?" },
      { label: "Is the Care Worker able to get out of the property quickly in the case of an emergency?" },
    ],
  },
  {
    id: "sec2",
    title: "Security & Emergencies",
    items: [
      { label: "Do all external windows close properly and lock?" },
      { label: "Do all external doors, including patio doors, close properly and lock?" },
      { label: "Are patio doors fitted with security bolts?" },
      { label: "Do windows or doors have cracked or broken glass?" },
      { label: "Is there a front door key hanging on a string through the letter-box?" },
      { label: "Is there an external door key kept under a rock, plant pot etc in the garden?" },
      { label: "Is the front door fitted with a safety chain?" },
      { label: "Is there an intruder alarm, and is it working properly?" },
      { label: "Are external security lights working properly?" },
      { label: "Are the electrical fuses easily reached in the event of an emergency?" },
      { label: "Is the gas main supply tap easily reached in the event of an emergency?" },
      { label: "Does the service user sleep in a room with a gas fire?" },
      { label: "Is the mains water stopcock easily reached in the event of an emergency?" },
      { label: "If needed, are step ladders available, and are they in a safe and sound condition?" },
      { label: "Are cigarette butts discarded into waste bins instead of ashtrays?" },
      { label: "Where fitted, are smoke alarms working properly?" },
      { label: "Where fitted, are household carbon monoxide detectors working properly?" },
      { label: "Are milk deliveries easily and safely reached?" },
      { label: "Are postal deliveries easily and safely reached?" },
      { label: "Are telephones kept connected to the jackplug sockets, and are they working properly?" },
    ],
  },
  {
    id: "sec3",
    title: "Electricity & Electrical Appliances",
    items: [
      { label: "Is the mains fuse-box easily reached?" },
      { label: "Is the mains fuse-box of the “trip-switch” type?" },
      { label: "Where the mains fuse-box is not of the “trip-switch” type are the mains fuses in sound order; i.e. not cracked, proper fusewire rating used etc?" },
      { label: "Are all electrical equipment and appliances working properly, as far as it is able to tell?" },
      { label: "Do any electrical appliances (irons, toasters, kettles etc) have broken or cracked plugs?" },
      { label: "Do any electrical appliances have bare wires protruding from the plug or appliance?" },
      { label: "Are electrical switches and sockets easily reached for use?" },
      { label: "Are electrical sockets overloaded with multiple appliances?" },
      { label: "Are electrical sockets cracked, damaged or discoloured, indicating burns?" },
      { label: "Are appliances such as TVs left plugged in when not in use?" },
      { label: "Are there any portable electrical appliances (fires etc) in the bathroom?" },
      { label: "If extension leads are used, is there evidence of damage, joins or overheating?" },
      { label: "Are there any RCDs (electrical circuit breakers) available for use with hazardous appliances?" },
      { label: "Do these check-points apply also to any powered garden equipment that may be used?" },
      { label: "Are electric towel rails used in bathrooms secure?" },
    ],
  },
  {
    id: "sec4",
    title: "Gas, Heating & Firelighting Appliances",
    items: [
      { label: "Is the environment comfortably warm and free from draughts?" },
      { label: "Is the environment well ventilated, particularly where portable gas heaters are used?" },
      { label: "Are the fireplace and surrounds in good condition?" },
      { label: "Are open fires allowed to go out, or are they kept lit during the night?" },
      { label: "Are open fires safely guarded?" },
      { label: "Are portable fires safely guarded and kept away from furniture and fittings such as curtains etc?" },
      { label: "Are free-standing portable fires kept as far to the centre of a room as possible?" },
      { label: "Are bottled gas supplies stored in a safe place, but also easy to reach?" },
      { label: "Can gas bottles within portable heaters be replaced easily and safely?" },
      { label: "Are chimneys and flues regularly swept?" },
      { label: "Are gas fires free from surrounding soot, or does the flame burn blue (orange or yellow flames are a sign of carbon monoxide)?" },
      { label: "Is there easy access to coal bunkers / coal or log supplies?" },
      { label: "Is there safe and adequate means of transporting coal, logs etc through to the fireplace?" },
      { label: "Are gas pilot lights on boilers and portable fires lit and regularly checked?" },
      { label: "Does the service user know what to do if a pilot light goes out?" },
    ],
  },
  {
    id: "sec5",
    title: "Cleaning, Washing & Laundering Facilities",
    items: [
      { label: "Is the environment generally kept in a clean and hygienic state?" },
      { label: "Is there evidence of pets fouling floors, furniture or fittings?" },
      { label: "Could any pets be considered to be harmful to Care Workers?" },
      { label: "Is there evidence of pest infestation, as may be indicated by mouse droppings, etc?" },
      { label: "Is the environment heavily polluted with tobacco smoke?" },
      { label: "Would such an environment possibly cause problems to Care Workers?" },
      { label: "Is household waste regularly put into waste bins and not left to accumulate?" },
      { label: "Is household waste regularly bagged up for disposal?" },
      { label: "Can the service user access the dustbin, and are dustbins regularly emptied?" },
      { label: "Are household detergents / bleaches / cleaners etc readily available?" },
      { label: "Are spray polishes and aerosols readily available?" },
      { label: "Are these substances kept stored in safe locations?" },
      { label: "Are these substances easily reached when required by adults, but not by children?" },
      { label: "Are these substances properly labelled; i.e. bleaches etc not kept in old lemonade bottles?" },
      { label: "Are caustic and corrosive chemicals stored safely?" },
      { label: "Do instructions for use clearly show how to deal with spillages?" },
      { label: "Do instructions for use include First Aid procedures?" },
      { label: "Are there adequate facilities for measuring out and diluting hazardous substances, as needed?" },
      { label: "Is there a washing machine / spin drier / tumble drier, and are these appliances in sound working order, as far as it is able to tell?" },
      { label: "Is there an electric iron, and is it in sound working order, as far as it is able to tell?" },
    ],
  },
  {
    id: "sec6",
    title: "The Kitchen, Food Handling & Meals",
    items: [
      { label: "Is the kitchen, including cupboards and larders, kept clean?" },
      { label: "Are all fresh foodstuffs stored in a safe and hygienic manner?" },
      { label: "Are all tinned and packaged foodstuffs stored in a safe and hygienic manner?" },
      { label: "Are all refrigerated and frozen foodstuffs stored in a safe and hygienic manner?" },
      { label: "Is the refrigerator regularly defrosted, or is it caked with ice?" },
      { label: "Is the freezer regularly defrosted, or is it caked with ice?" },
      { label: "Is there evidence of frozen food having been thawed out, and then re-frozen?" },
      { label: "Is there evidence of foodstuffs kept for consumption that are past their “sell by” date?" },
      { label: "Are gas / electric hobs working properly?" },
      { label: "Are there any tea-towels or kitchen cloths etc hanging over the gas hob to dry?" },
      { label: "Are there oven gloves available for handling hot dishes etc?" },
      { label: "Are saucepan handles protruding over the edge of the hob?" },
      { label: "Are kitchen appliances in sound working order, as far as it is able to tell?" },
      { label: "Do the electrical features referenced in section 3 appear to be safe for each appliance?" },
      { label: "Are kitchen knives stored safely?" },
      { label: "Is there an adequate supply of cling-film or foil-wrap with which to wrap and preserve snacks?" },
      { label: "Can kitchen cupboards be safely reached without the need for steps, or standing on chairs etc?" },
    ],
  },
  {
    id: "sec7",
    title: "Medication",
    items: [
      { label: "Is the service user taking any medication, and if so is there a medication regime on record?" },
      { label: "Are all drugs and medicines kept in a cool, dry place, and in their original containers?" },
      { label: "Are drugs or medicines requiring low temperature storage kept in the refrigerator?" },
      { label: "Are ALL drugs and medicines clearly labelled?" },
      { label: "Are all drugs and medicines within their expiry dates?" },
      { label: "Are there proper facilities (Sharps boxes) for the disposal of syringes for those clients that inject?" },
      { label: "Is there evidence of out-dated or unwanted drugs and medicines left lying around?" },
      { label: "Is the service user able to open all drugs and medicines containers easily?" },
      { label: "Does the service user have adequate supplies of First Aid materials such as band-aids, bandages etc?" },
    ],
  },
  {
    id: "sec8",
    title: "Gardens & Exterior Features",
    items: [
      { label: "Are outside paths and drives uneven, damaged or slippery?" },
      { label: "Are outside paths overhung with shrubs, making access difficult?" },
      { label: "Are outside paths poorly lit?" },
      { label: "Are outside steps uneven, damaged or slippery?" },
      { label: "Are outside steps too steep, making access difficult for the service user?" },
      { label: "Is there evidence of loose roof tiles etc that present a hazard?" },
      { label: "Are exterior doors in a sound condition, and secure from the outside?" },
      { label: "Are there handrails / guide-rails fitted on steps?" },
      { label: "Is rubbish / household waste left to accumulate?" },
    ],
  },
  {
    id: 'signoff',
    title: 'Sign-off',
    items: [
      { label: 'Risk assessment carried out by (signature)', type: 'signature' },
      { label: 'Date completed', type: 'date' },
    ],
  },
  ],
};

export const RA_FIRE_SAFETY: RaForm = {
  type: 'FIRE_SAFETY',
  title: 'Fire Safety Risk Assessment',
  sections: [
  {
    id: 'details',
    title: 'Assessment Details',
    intro: 'Risk key — High: reduce the risk immediately. Moderate: identify actions required to reduce the risk. Low: reduce the risk if practicable.',
    items: [
      { label: 'Service user name and address', type: 'text' },
      { label: 'Name of assessor', type: 'text' },
      { label: 'Date', type: 'date' },
      { label: 'Review date', type: 'date' },
    ],
  },
  {
    id: 'increased',
    title: 'Increased Fire Risk',
    items: [
      { label: 'Smoking', type: 'hazard' },
      { label: 'Evidence of previous fires or near misses e.g. scorch marks, cigarette burns on furniture, heaters', type: 'hazard' },
      { label: 'Overloaded sockets', type: 'hazard' },
      { label: 'Signs of unsafe wiring', type: 'hazard' },
      { label: 'Unsafe use of candles or naked flames', type: 'hazard' },
      { label: 'Hoarding disorders', type: 'hazard' },
      { label: 'Are combustible materials close to sources of ignition? i.e. clothes drying in front of a gas fire', type: 'hazard' },
      { label: 'Incidents or threats to property', type: 'hazard' },
    ],
  },
  {
    id: 'react',
    title: 'Less Able to React if There is a Fire',
    items: [
      { label: 'No working smoke alarms', type: 'hazard' },
      { label: 'Person has a history of alcohol dependency or drug misuse (prescribed or recreational)', type: 'hazard' },
      { label: 'Mental health conditions such as dementia or learning disability', type: 'hazard' },
      { label: 'Physical or sensory impairment', type: 'hazard' },
    ],
  },
  {
    id: 'escape',
    title: 'Reduced Ability to Escape',
    items: [
      { label: 'Reduced mobility due to physical disability or age-related problems / long-term illness', type: 'hazard' },
      { label: 'Difficulties in making decisions', type: 'hazard' },
    ],
  },
  {
    id: 'plans',
    title: 'Escape Plans',
    items: [
      { label: 'Type of property', type: 'hazard', hint: 'Flat, bedsit, bungalow, house' },
      { label: 'Is there a planned escape route for the type of property?', type: 'hazard' },
      { label: 'Is the escape route free from obstructions?', type: 'hazard' },
      { label: 'Is there a stay-put scheme in place?', type: 'hazard' },
    ],
  },
  {
    id: 'awareness',
    title: 'Awareness',
    items: [
      { label: 'A Home Safety Fire Check has been carried out in the property by the local fire officer', type: 'hazard' },
      { label: 'Are fire extinguishers and fire blankets available?', type: 'hazard' },
      { label: 'Are the service user and family aware of hazards?', type: 'hazard' },
      { label: 'Are smoke alarms routinely tested?', type: 'hazard' },
    ],
  },
  {
    id: 'staff',
    title: 'Staff Training',
    items: [
      { label: 'Staff aware of fire risks on the property', type: 'hazard' },
      { label: 'The staff know how to act in the event of a fire', type: 'hazard' },
      { label: 'If a smoker, a separate Smokers Home Safety risk assessment has been completed', type: 'hazard' },
      { label: 'Emollient creams being used by the service user', type: 'hazard' },
    ],
  },
  {
    id: 'signoff',
    title: 'Sign-off',
    items: [
      { label: 'Actions completed and reduced risk factor', type: 'longtext' },
      { label: 'Signature', type: 'signature' },
      { label: 'Date completed', type: 'date' },
    ],
  },
  ],
};

export const RA_BATHING: RaForm = {
  type: 'BATHING',
  title: 'Bathing & Showering Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [{ label: 'Name of service user', type: 'text' }],
    },
    {
      id: 'checks',
      title: 'Bathing & Showering Checks',
      intro: 'Mark Yes or No for each observation and add any comment.',
      items: [
        { label: 'Service user is able to safely run a bath, or add cold water, unattended.', type: 'yesno' },
        { label: 'Service user is able to enter / exit a bath / shower safely and unaided.', type: 'yesno' },
        { label: 'Service user is able to safely stand unaided in a shower OR there is a shower stool available.', type: 'yesno' },
        { label: 'Where required, grab handles are within easy reach and are securely fixed.', type: 'yesno' },
        { label: 'Textured bath / shower mats are available to assist grip and reduce risk of slipping.', type: 'yesno' },
        { label: 'Service user can differentiate between hot and cold taps OR can safely operate mixer taps / thermostatic valve taps.', type: 'yesno' },
        { label: 'Service user does not have an impaired sensitivity to temperature.', type: 'yesno' },
        { label: 'Service user’s mental capacity allows them to recognise a bath or shower that is too hot.', type: 'yesno' },
        { label: 'Showers — risk of excessive OR restricted cold water arising from water diversions around gravity-fed shower systems.', type: 'yesno' },
        { label: 'Service user is able to summon assistance when needed.', type: 'yesno' },
        { label: 'Bath hoists or other lifting aids required.', type: 'yesno' },
        { label: 'Thermometers are available to check the temperature of bathing / showering water.', type: 'yesno' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Registry — add future risk assessments (Manual Handling, Smoking…) here.

// Care 24 Smoking Risk Assessment — the company’s own controlled document
// (owned by the Registered Manager, approved by the Managing Director),
// reproduced rather than reinvented so the on-screen version and the paper
// one are the same assessment.
//
// Section 3 scores likelihood x severity and bands the result Low 1-6,
// Medium 7-12, High 13-25. The product is computed rather than typed: it
// decides whether a manager signature is required in section 6, and that is
// not a sum anyone should be doing in their head at a kitchen table.
export const RA_SMOKING: RaForm = {
  type: 'SMOKING',
  title: 'Smoking Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Service user name', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Assessor name', type: 'text' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'status',
      title: '1. Smoking Status',
      intro: 'If the service user does not smoke, the form is complete.',
      items: [
        { label: 'Does the service user smoke?', type: 'yesno' },
        { label: 'Cigarettes', type: 'check' },
        { label: 'Roll-ups', type: 'check' },
        { label: 'E-cigarette / vape', type: 'check' },
      ],
    },
    {
      id: 'risks',
      title: '2. Key Risks',
      intro: 'Tick any that apply.',
      items: [
        { label: 'Smokes in bed or on a sofa', type: 'check' },
        { label: 'Falls asleep while smoking', type: 'check' },
        { label: 'Memory problems / forgets they lit a cigarette', type: 'check' },
        { label: 'No working smoke alarm', type: 'check' },
        { label: 'No safe ashtray available', type: 'check' },
        { label: 'Uses oxygen therapy', type: 'check' },
        { label: 'Tremors or poor grip (risk of dropping)', type: 'check' },
        { label: 'Reduced mobility (cannot reach ashtray)', type: 'check' },
        { label: 'Smokes near soft furnishings (curtains, bedding)', type: 'check' },
        { label: 'Requires help to light or hold cigarette', type: 'check' },
        { label: 'Other', type: 'text' },
      ],
    },
    {
      id: 'rating',
      title: '3. Risk Rating',
      items: [
        { label: 'Likelihood', type: 'scale', hint: '1 = low, 5 = high' },
        { label: 'Severity', type: 'scale', hint: '1 = low, 5 = high' },
        { label: 'Overall risk (likelihood × severity)', type: 'score', scoreFrom: [0, 1] },
      ],
    },
    {
      id: 'controls',
      title: '4. Control Measures Needed',
      intro: 'Tick as appropriate.',
      items: [
        { label: 'Supervise while smoking', type: 'check' },
        { label: 'Smoke only outdoors', type: 'check' },
        { label: 'No smoking in bedroom', type: 'check' },
        { label: 'One cigarette at a time only', type: 'check' },
        { label: 'Provide heavy non-tip ashtray', type: 'check' },
        { label: 'Keep lighter / cigarettes out of reach', type: 'check' },
        { label: 'Test smoke alarm weekly', type: 'check' },
        { label: 'Oxygen off and 2 metres away', type: 'check' },
        { label: 'Other', type: 'text' },
      ],
    },
    {
      id: 'capacity',
      title: '5. Capacity & Agreement',
      items: [
        { label: 'Does the service user understand the risks?', type: 'yesno' },
        { label: 'Agrees to the controls above — Yes', type: 'check' },
        { label: 'Agrees to the controls above — Partially', type: 'check' },
        { label: 'Agrees to the controls above — No (refer to manager / best interests)', type: 'check' },
      ],
    },
    {
      id: 'signoff',
      title: '6. Sign-off',
      items: [
        { label: 'Assessor signature', type: 'signature' },
        { label: 'Date', type: 'date' },
        { label: 'Manager signature (required if high risk)', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Falls. The most common cause of harm in home care, and the first assessment
// an inspector asks for. Split into the person (what makes THIS person likely
// to fall) and the property (what they would fall over), because the two lead
// to different actions: a referral versus a job someone can do this week.
export const RA_FALLS: RaForm = {
  type: 'FALLS',
  title: 'Falls Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Name of service user', type: 'text' },
        { label: 'Name of assessor', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'history',
      title: 'Falls History',
      intro: 'A fall in the last twelve months is the strongest single predictor of another one. Any Yes here means this assessment needs reviewing more often than annually.',
      items: [
        { label: 'Has the person fallen in the last 12 months?', type: 'yesno' },
        { label: 'Has the person fallen more than once in the last 12 months?', type: 'yesno' },
        { label: 'Did any fall result in injury, or an ambulance or hospital attendance?', type: 'yesno' },
        { label: 'Was the person on the floor a long time before help arrived?', type: 'yesno' },
        { label: 'Is the person afraid of falling, or doing less because of that fear?', type: 'yesno' },
      ],
    },
    {
      id: 'factors',
      title: 'Personal Risk Factors',
      intro: 'Mark Yes for each factor that applies. Every Yes should carry a comment saying what is being done about it.',
      items: [
        { label: 'Unsteady gait, poor balance or reduced mobility', type: 'yesno' },
        { label: 'Difficulty rising from a chair, or muscle weakness', type: 'yesno' },
        { label: 'Uses a walking aid (stick, frame, rollator)', type: 'yesno' },
        { label: 'Dizziness, light-headedness, blackouts, or falls with no warning', type: 'yesno' },
        { label: 'Blood pressure drops on standing (postural hypotension)', type: 'yesno' },
        { label: 'Takes four or more prescribed medicines', type: 'yesno' },
        { label: 'Takes sedatives, antidepressants, opioids, diuretics or blood pressure medicines', type: 'yesno', hint: 'These raise falls risk. A medication review is often the single most useful action on this form.' },
        { label: 'Alcohol affects steadiness', type: 'yesno' },
        { label: 'Sight problems, or glasses that are not up to date', type: 'yesno' },
        { label: 'Hearing problems affecting balance', type: 'yesno' },
        { label: 'Foot problems, or unsafe or poorly fitting footwear', type: 'yesno' },
        { label: 'Continence problems, or needing the toilet urgently at night', type: 'yesno' },
        { label: 'Confusion or cognitive impairment affecting awareness of danger', type: 'yesno' },
        { label: 'Osteoporosis, or known fragile bones', type: 'yesno', hint: 'Changes the consequence of a fall rather than its likelihood - a fracture becomes far more likely.' },
      ],
    },
    {
      id: 'environment',
      title: 'The Home',
      items: [
        { label: 'Floors, rugs, trailing wires and clutter on the routes the person actually walks', type: 'risk' },
        { label: 'Lighting, including at night and on the stairs', type: 'risk' },
        { label: 'Stairs, steps and handrails', type: 'risk' },
        { label: 'Height of the bed, chair and toilet, and grab rails where needed', type: 'risk' },
        { label: 'Bathroom - wet floors, and getting in and out of the bath or shower', type: 'risk' },
        { label: 'Reaching a phone, call alarm or pendant from the floor', type: 'risk' },
        { label: 'Outside - paths, steps, doorways and lighting', type: 'risk' },
        { label: 'Pets underfoot', type: 'risk' },
      ],
    },
    {
      id: 'equipment',
      title: 'Equipment',
      items: [
        { label: 'Equipment in use is suitable, in good order and within its service date', type: 'yesno' },
        { label: 'The person can use their walking aid safely and keeps it within reach', type: 'yesno' },
        { label: 'A falls alarm or pendant is in place and actually worn', type: 'yesno' },
        { label: 'Bed rails are in use', type: 'yesno', hint: 'If Yes, a separate bed rails assessment is required - rails carry their own entrapment risk.' },
      ],
    },
    {
      id: 'plan',
      title: 'Actions and Plan',
      items: [
        { label: 'Actions agreed to reduce the risk, and who is responsible for each', type: 'longtext' },
        { label: 'Referrals made (GP, falls service, occupational therapy, physiotherapy)', type: 'longtext' },
        { label: 'What a carer must do if they find this person on the floor', type: 'longtext', hint: 'Be specific. Do not lift before checking for injury; call 999 if injury is suspected or the person cannot get up; record it as an incident either way.' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Moving and handling. The one assessment a carer genuinely reads before a
// visit, so the method section is written to be followed rather than filed.
// Carries the hoist and sling detail including LOLER dates, because a sling of
// the wrong size is how people get hurt.
export const RA_MOVING_HANDLING: RaForm = {
  type: 'MOVING_HANDLING',
  title: 'Moving & Handling Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Name of service user', type: 'text' },
        { label: 'Name of assessor', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'person',
      title: 'The Person',
      items: [
        { label: 'Approximate weight', type: 'text' },
        { label: 'Approximate height', type: 'text' },
        { label: 'Able to bear weight through both legs', type: 'yesno' },
        { label: 'Able to understand and follow instructions during a move', type: 'yesno' },
        { label: 'Able to tell a carer about pain or discomfort', type: 'yesno' },
        { label: 'Able to help with the move', type: 'yesno' },
        { label: 'Pain, stiffness, contractures or joint problems affecting handling', type: 'longtext' },
        { label: 'Skin condition, wounds or pressure damage to protect during a move', type: 'longtext' },
        { label: 'Catheter, PEG, stoma, oxygen or other lines to protect during a move', type: 'longtext' },
        { label: 'Behaviour that may change during a move, and what helps', type: 'longtext' },
      ],
    },
    {
      id: 'tasks',
      title: 'Handling Tasks',
      intro: 'Score each move this person actually needs. Leave blank any that do not apply.',
      items: [
        { label: 'Moving up or turning in bed', type: 'risk' },
        { label: 'Bed to chair, and chair to bed', type: 'risk' },
        { label: 'Sit to stand from a chair', type: 'risk' },
        { label: 'On and off the toilet or commode', type: 'risk' },
        { label: 'Bathing and showering transfers', type: 'risk' },
        { label: 'Walking and moving around the home', type: 'risk' },
        { label: 'Stairs', type: 'risk' },
        { label: 'In and out of a vehicle', type: 'risk' },
        { label: 'Moving the person after a fall', type: 'risk' },
      ],
    },
    {
      id: 'equipment',
      title: 'Equipment',
      items: [
        { label: 'Equipment required', type: 'longtext', hint: 'Hoist, stand aid, slide sheet, transfer board, handling belt, bed rails, profiling bed, specialist chair.' },
        { label: 'Hoist make and model', type: 'text' },
        { label: 'Sling type and size', type: 'text' },
        { label: 'Sling loop settings to use', type: 'text' },
        { label: 'Date of last LOLER inspection', type: 'date', hint: 'Hoists and slings must be thoroughly examined every 6 months under LOLER.' },
        { label: 'Next LOLER inspection due', type: 'date' },
        { label: 'Who owns and maintains the equipment', type: 'text' },
      ],
    },
    {
      id: 'carers',
      title: 'Carers Required',
      items: [
        { label: 'Number of carers required for each move', type: 'text' },
        { label: 'If any move is single-handed, what makes it safe', type: 'longtext' },
      ],
    },
    {
      id: 'method',
      title: 'Method',
      items: [
        { label: 'Step-by-step method carers must follow', type: 'longtext' },
        { label: 'What must never be done with this person', type: 'longtext', hint: 'For example drag lifts, lifting under the arms, or lifting from the floor by hand.' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Medication. Also carries the support level - prompt, assist or administer -
// which the compliance review found was recorded nowhere in the system, even
// though it decides what a carer is allowed to do at every visit.
export const RA_MEDICATION: RaForm = {
  type: 'MEDICATION',
  title: 'Medication Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Name of service user', type: 'text' },
        { label: 'Name of assessor', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'support',
      title: 'Level of Support',
      intro: 'Mark Yes against one level only. This is what carers are authorised to do with this person’s medicines.',
      items: [
        { label: 'Prompt - the person takes their own medicines and needs reminding', type: 'yesno' },
        { label: 'Assist - the person takes their medicines with physical help, such as opening a pack or passing a glass', type: 'yesno' },
        { label: 'Administer - the carer gives the medicine', type: 'yesno' },
        { label: 'Who orders repeat prescriptions', type: 'text' },
        { label: 'Who collects medicines from the pharmacy', type: 'text' },
        { label: 'Pharmacy name and contact', type: 'text' },
        { label: 'GP practice name and contact', type: 'text' },
      ],
    },
    {
      id: 'capacity',
      title: 'Consent and Capacity',
      items: [
        { label: 'The person understands what their medicines are for, and what happens if they are not taken', type: 'yesno' },
        { label: 'A mental capacity assessment has been completed for decisions about medicines', type: 'yesno' },
        { label: 'The person has refused medicines in the past', type: 'yesno' },
        { label: 'Any medicine is given covertly', type: 'yesno', hint: 'Covert administration needs a capacity assessment, a recorded best-interest decision and written pharmacist advice BEFORE it starts. Never a carer’s decision on the day.' },
      ],
    },
    {
      id: 'kinds',
      title: 'Kinds of Medicine in Use',
      items: [
        { label: 'Time-critical medicines', type: 'yesno', hint: 'Parkinson’s medicines, insulin, anticoagulants, some epilepsy medicines. A late dose is a harm, not a late visit.' },
        { label: 'Controlled drugs', type: 'yesno' },
        { label: 'Insulin or other injections', type: 'yesno' },
        { label: 'Anticoagulants needing blood monitoring', type: 'yesno' },
        { label: 'Oxygen', type: 'yesno' },
        { label: 'Patches', type: 'yesno' },
        { label: 'Creams and other topical medicines', type: 'yesno' },
        { label: 'Eye, ear or nose drops', type: 'yesno' },
        { label: 'Medicines given through a PEG or other tube', type: 'yesno' },
        { label: 'As-required (PRN) medicines', type: 'yesno', hint: 'Each one needs a written protocol: when to give it, the maximum in 24 hours, and what effect to record afterwards.' },
        { label: 'Blister pack or monitored dosage system in use', type: 'yesno' },
      ],
    },
    {
      id: 'risks',
      title: 'Risks',
      items: [
        { label: 'Storage - where medicines are kept, and whether that is secure', type: 'risk' },
        { label: 'Medicines needing a fridge, and how the temperature is checked', type: 'risk' },
        { label: 'Controlled drugs - recording, witnessing and stock checks', type: 'risk' },
        { label: 'Sharps, and how they are disposed of', type: 'risk' },
        { label: 'Return and disposal of unwanted or out-of-date medicines', type: 'risk' },
        { label: 'Swallowing difficulties affecting medicines', type: 'risk', hint: 'Crushing a tablet or opening a capsule changes how the medicine works and needs pharmacist advice first.' },
        { label: 'Known allergies or previous reactions to a medicine', type: 'risk' },
        { label: 'Doses left out between visits, or taken by someone else in the home', type: 'risk' },
        { label: 'Gaps between visits that the dosing schedule cannot cover', type: 'risk' },
      ],
    },
    {
      id: 'plan',
      title: 'Actions and Plan',
      items: [
        { label: 'Actions agreed, and who is responsible for each', type: 'longtext' },
        { label: 'What a carer must do if a dose is refused, missed, spilt or given in error', type: 'longtext', hint: 'Name who to ring and by when. A medication error is an incident, and may also be a safeguarding concern.' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Pressure ulcers. Waterlow and PURPOSE-T are published clinical tools with
// their own scoring tables; this form does not reproduce them. It records the
// domains a carer can observe, the score the clinical tool produced, and what
// follows from it - so the tool stays the clinical source and Caremid holds
// the record, the actions and the review date.
export const RA_PRESSURE_ULCER: RaForm = {
  type: 'PRESSURE_ULCER',
  title: 'Pressure Ulcer / Skin Integrity Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Name of service user', type: 'text' },
        { label: 'Name of assessor', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'tool',
      title: 'Clinical Score',
      intro: 'Where a district nurse or clinician has scored this person on a recognised tool, record the result here. Leave blank if no tool has been used - the observations below still apply.',
      items: [
        { label: 'Tool used (Waterlow, PURPOSE-T, Braden, other)', type: 'text' },
        { label: 'Score', type: 'text' },
        { label: 'Risk band the tool gave', type: 'text' },
        { label: 'Who scored it, and their role', type: 'text' },
        { label: 'Date scored', type: 'date' },
      ],
    },
    {
      id: 'factors',
      title: 'Risk Factors',
      intro: 'Mark Yes for each factor that applies.',
      items: [
        { label: 'Limited mobility, or unable to reposition without help', type: 'yesno' },
        { label: 'Spends most of the day in a bed or chair', type: 'yesno' },
        { label: 'Has an existing pressure ulcer, or has had one before', type: 'yesno' },
        { label: 'Incontinence, or skin regularly damp', type: 'yesno' },
        { label: 'Poor appetite, weight loss, or poor fluid intake', type: 'yesno' },
        { label: 'Diabetes, circulation problems or peripheral vascular disease', type: 'yesno' },
        { label: 'Reduced sensation - cannot feel discomfort or pressure', type: 'yesno' },
        { label: 'Very thin, or very heavy', type: 'yesno' },
        { label: 'Skin is fragile, dry, papery or already broken', type: 'yesno' },
        { label: 'Equipment in contact with skin (catheter, oxygen tubing, cast, splint, ill-fitting shoes)', type: 'yesno' },
      ],
    },
    {
      id: 'skin',
      title: 'Current Skin Condition',
      intro: 'Record what the skin looks like now at each pressure point, and where any existing damage is.',
      items: [
        { label: 'Sacrum and buttocks', type: 'risk' },
        { label: 'Heels and ankles', type: 'risk' },
        { label: 'Hips', type: 'risk' },
        { label: 'Elbows and shoulders', type: 'risk' },
        { label: 'Back of the head and ears', type: 'risk' },
        { label: 'Under breasts, skin folds, between toes', type: 'risk' },
        { label: 'Existing wounds or pressure damage - where, what grade, who is dressing it', type: 'longtext' },
      ],
    },
    {
      id: 'prevention',
      title: 'Prevention in Place',
      items: [
        { label: 'Repositioning schedule agreed', type: 'yesno', hint: 'If Yes, say how often below and start a repositioning chart.' },
        { label: 'Pressure-relieving mattress in use', type: 'yesno' },
        { label: 'Pressure-relieving cushion in use', type: 'yesno' },
        { label: 'Heel protectors or other devices in use', type: 'yesno' },
        { label: 'Barrier cream or prescribed skin products in use', type: 'yesno' },
        { label: 'District nurse involved', type: 'yesno' },
        { label: 'How often the person needs repositioning, and in what positions', type: 'longtext' },
      ],
    },
    {
      id: 'plan',
      title: 'Actions and Plan',
      items: [
        { label: 'Actions agreed, and who is responsible for each', type: 'longtext' },
        { label: 'What a carer must do if they see new redness, broken skin or a blister', type: 'longtext', hint: 'Redness that does not fade under light pressure is already damage. Name who to ring and by when - this is often also an incident.' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Nutrition and hydration. As with pressure ulcers, MUST is a published tool
// with its own scoring; this records the result and the care that follows.
export const RA_MALNUTRITION: RaForm = {
  type: 'MALNUTRITION',
  title: 'Nutrition & Hydration Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Name of service user', type: 'text' },
        { label: 'Name of assessor', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'measures',
      title: 'Measurements',
      items: [
        { label: 'Weight', type: 'text' },
        { label: 'Date weighed', type: 'date' },
        { label: 'Height', type: 'text' },
        { label: 'BMI, if known', type: 'text' },
        { label: 'Usual weight, and any recent change', type: 'text' },
        { label: 'How often this person should be weighed', type: 'text' },
      ],
    },
    {
      id: 'tool',
      title: 'Clinical Score',
      intro: 'Where a clinician has screened this person on a recognised tool such as MUST, record the result. Leave blank if none has been done.',
      items: [
        { label: 'Tool used', type: 'text' },
        { label: 'Score', type: 'text' },
        { label: 'Risk band the tool gave', type: 'text' },
        { label: 'Who screened, and their role', type: 'text' },
        { label: 'Date screened', type: 'date' },
      ],
    },
    {
      id: 'factors',
      title: 'Risk Factors',
      items: [
        { label: 'Unintentional weight loss', type: 'yesno' },
        { label: 'Clothes, rings or dentures have become loose', type: 'yesno' },
        { label: 'Poor appetite, or regularly leaves food', type: 'yesno' },
        { label: 'Difficulty chewing, or problems with teeth or dentures', type: 'yesno' },
        { label: 'Difficulty swallowing', type: 'yesno', hint: 'If Yes, a choking risk assessment is also required, and any SALT advice must be on file.' },
        { label: 'Needs help to eat or drink', type: 'yesno' },
        { label: 'Forgets to eat or drink, or forgets having eaten', type: 'yesno' },
        { label: 'Drinks very little during the day', type: 'yesno' },
        { label: 'Avoids drinking because of continence worries', type: 'yesno' },
        { label: 'Nausea, vomiting, constipation or diarrhoea affecting intake', type: 'yesno' },
        { label: 'Low mood or bereavement affecting appetite', type: 'yesno' },
        { label: 'Unable to shop or prepare food', type: 'yesno' },
      ],
    },
    {
      id: 'needs',
      title: 'Diet and Preferences',
      items: [
        { label: 'Special diet (diabetic, renal, gluten free, low salt, fortified)', type: 'longtext' },
        { label: 'Texture-modified diet or thickened fluids, and the exact level prescribed', type: 'longtext', hint: 'Record the IDDSI level exactly as SALT prescribed it. Getting this wrong is a choking risk.' },
        { label: 'Cultural, religious or ethical requirements', type: 'longtext' },
        { label: 'Allergies and intolerances', type: 'longtext' },
        { label: 'Foods and drinks the person likes, and what they will usually accept', type: 'longtext' },
        { label: 'Prescribed supplements, and when they are taken', type: 'longtext' },
        { label: 'Equipment that helps (adapted cutlery, plate guard, beaker, non-slip mat)', type: 'longtext' },
      ],
    },
    {
      id: 'risks',
      title: 'Risks',
      items: [
        { label: 'Not eating enough across the day, given the visit pattern', type: 'risk' },
        { label: 'Not drinking enough across the day', type: 'risk' },
        { label: 'Food left out of date, or stored unsafely', type: 'risk' },
        { label: 'Unable to reach food and drink left between visits', type: 'risk' },
        { label: 'Meals missed at weekends, or when a family member is away', type: 'risk' },
      ],
    },
    {
      id: 'plan',
      title: 'Actions and Plan',
      items: [
        { label: 'Food and fluid charts required', type: 'yesno' },
        { label: 'Target daily fluid intake, if one has been set', type: 'text' },
        { label: 'Actions agreed, and who is responsible for each', type: 'longtext' },
        { label: 'Referrals made (GP, dietitian, speech and language therapy)', type: 'longtext' },
        { label: 'What a carer must do if the person repeatedly refuses food or drink', type: 'longtext' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

// Choking and swallowing. Short on purpose: a carer needs to read this one in
// under a minute, standing in a kitchen, before they put food in front of
// someone. The SALT instructions are the part that matters, so they are
// written to be copied out exactly rather than summarised.
export const RA_CHOKING: RaForm = {
  type: 'CHOKING',
  title: 'Choking & Swallowing Risk Assessment',
  sections: [
    {
      id: 'details',
      title: 'Assessment Details',
      items: [
        { label: 'Name of service user', type: 'text' },
        { label: 'Name of assessor', type: 'text' },
        { label: 'Date', type: 'date' },
        { label: 'Review date', type: 'date' },
      ],
    },
    {
      id: 'signs',
      title: 'Signs of Swallowing Difficulty',
      intro: 'Any Yes here means a speech and language therapy referral, if one has not already been made.',
      items: [
        { label: 'Coughing or choking during or just after eating or drinking', type: 'yesno' },
        { label: 'A wet or gurgly voice after swallowing', type: 'yesno' },
        { label: 'Food or drink leaking from the mouth', type: 'yesno' },
        { label: 'Food held in the mouth, or pocketed in the cheek', type: 'yesno' },
        { label: 'Takes a very long time to finish a meal', type: 'yesno' },
        { label: 'Repeated chest infections or pneumonia', type: 'yesno', hint: 'Often the first sign that food or drink is going into the lungs.' },
        { label: 'Avoids particular foods or drinks', type: 'yesno' },
        { label: 'Weight loss alongside any of the above', type: 'yesno' },
        { label: 'Has choked before, and needed help', type: 'yesno' },
      ],
    },
    {
      id: 'salt',
      title: 'Speech and Language Therapy',
      items: [
        { label: 'Has this person been seen by speech and language therapy', type: 'yesno' },
        { label: 'Date last seen', type: 'date' },
        { label: 'Food texture prescribed, exactly as written by SALT', type: 'longtext', hint: 'Record the IDDSI level and its name. Do not paraphrase - a carer will follow what is written here.' },
        { label: 'Drink thickness prescribed, exactly as written by SALT', type: 'longtext', hint: 'Include the thickener product, the number of scoops and the volume it applies to.' },
        { label: 'Positioning required for eating and drinking', type: 'longtext' },
        { label: 'Pacing, prompting and supervision required', type: 'longtext' },
        { label: 'Anything this person must never be given', type: 'longtext' },
      ],
    },
    {
      id: 'risks',
      title: 'Other Risks',
      items: [
        { label: 'Teeth, dentures and mouth care', type: 'risk' },
        { label: 'Eating unsupervised, or between visits', type: 'risk' },
        { label: 'Access to food that is the wrong texture', type: 'risk', hint: 'Including food brought in by family or neighbours.' },
        { label: 'Medicines that are hard to swallow', type: 'risk' },
        { label: 'Rushing, distraction or talking while eating', type: 'risk' },
        { label: 'Alcohol or sedating medicines at mealtimes', type: 'risk' },
      ],
    },
    {
      id: 'emergency',
      title: 'If This Person Chokes',
      items: [
        { label: 'What a carer must do, step by step', type: 'longtext', hint: 'Encourage coughing; back blows and abdominal thrusts if the airway is blocked; 999 immediately if they cannot clear it. Record it as an incident afterwards whatever the outcome.' },
        { label: 'Staff supporting this person are trained in choking first aid', type: 'yesno' },
        { label: 'Suction or other equipment in the home, and who may use it', type: 'longtext' },
      ],
    },
    {
      id: 'plan',
      title: 'Actions and Plan',
      items: [
        { label: 'Actions agreed, and who is responsible for each', type: 'longtext' },
        { label: 'Referrals made', type: 'longtext' },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      items: [
        { label: 'Person conducting risk assessment', type: 'text' },
        { label: 'Signature', type: 'signature' },
        { label: 'Date', type: 'date' },
      ],
    },
  ],
};

export const RA_FORMS: Record<string, RaForm> = { ENVIRONMENT: RA_ENVIRONMENT, FIRE_SAFETY: RA_FIRE_SAFETY, FALLS: RA_FALLS, MOVING_HANDLING: RA_MOVING_HANDLING, MEDICATION: RA_MEDICATION, PRESSURE_ULCER: RA_PRESSURE_ULCER, MALNUTRITION: RA_MALNUTRITION, CHOKING: RA_CHOKING, SMOKING: RA_SMOKING, BATHING: RA_BATHING };

export const RA_TYPES: { type: string; title: string }[] = Object.values(RA_FORMS).map((f) => ({ type: f.type, title: f.title }));
