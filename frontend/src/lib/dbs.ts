// A DBS certificate is generally re-checked every 3 years, so a certificate
// issued more than 3 years ago is flagged for renewal across the DBS screens.
export function dbsOverThreeYears(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const issued = new Date(dateStr);
  if (isNaN(issued.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);
  return issued < cutoff;
}
