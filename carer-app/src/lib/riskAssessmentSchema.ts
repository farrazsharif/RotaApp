// AUTO-BUILT from Care 24 form 03-3-006 "Risk Assessment - Workplace Environment
// (Service User Property)". Each hazard item is scored Low/Med/High with a
// Comment and an Action, mirroring the paper form. Shared shape used by the
// portal (fill/print) and the carer app (read-only).

export type RaItemType = 'risk' | 'hazard' | 'yesno' | 'text' | 'longtext' | 'date' | 'signature';

export interface RaItem {
  label: string;
  type?: RaItemType; // default 'risk'
  hint?: string;     // optional example / guidance shown under the label
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
export const RA_FORMS: Record<string, RaForm> = { ENVIRONMENT: RA_ENVIRONMENT, FIRE_SAFETY: RA_FIRE_SAFETY, BATHING: RA_BATHING };

export const RA_TYPES: { type: string; title: string }[] = Object.values(RA_FORMS).map((f) => ({ type: f.type, title: f.title }));
