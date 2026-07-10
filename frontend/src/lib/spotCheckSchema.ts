// The carer spot-check observation checklist (from Care 24's paper form). Each
// item is answered Yes / No / N/A with an optional comment.
export const SPOT_CHECK_ITEMS: { id: string; label: string }[] = [
  { id: 'on_time', label: 'Was the carer on time?' },
  { id: 'uniform_id', label: 'Was the carer in uniform and wearing their ID badge?' },
  { id: 'informed_arrival', label: 'Did the carer inform the service user they had arrived?' },
  { id: 'checked_comms_log', label: 'Did the carer check the communication logs before starting?' },
  { id: 'communicated_tasks', label: 'Did the carer communicate with the service user while performing tasks?' },
  { id: 'friendly', label: 'Did the carer have a friendly approach?' },
  { id: 'equipment_safe', label: 'If equipment was used, was it used safely and correctly?' },
  { id: 'ppe', label: 'Did the carer use PPE during tasks?' },
  { id: 'documented', label: "Did the carer document their tasks and sign the service user's file?" },
  { id: 'informed_leaving', label: 'Did the carer inform the service user before leaving?' },
  { id: 'personal_hygiene', label: 'Did the carer take care of personal hygiene?' },
  { id: 'medication', label: 'Was medication handled / administered appropriately?' },
  { id: 'dignity', label: 'Was the dignity of the service user maintained?' },
  { id: 'food_prepared', label: 'If food was prepared, was it prepared appropriately?' },
  { id: 'food_served', label: 'If food was served, was it served appropriately?' },
  { id: 'suitable', label: 'Do you feel the carer is suitable for the tasks observed?' },
];
