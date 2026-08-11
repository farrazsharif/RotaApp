import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';

// Company letterhead for DOM-printed forms (Emergency Grab Sheet, on-page
// reports) — the counterpart to lib/printBranding for the forms that print the
// live page via window.print() rather than a generated document. Rendered
// inside the printable region so the printout carries the company's own logo,
// name and address instead of a hard-coded identity. Pass className to control
// on-screen visibility (e.g. "hidden print:flex" to show it only on paper).
export default function PrintBrandingHeader({ className = '' }: { className?: string }) {
  const { data: s } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60 * 1000 });
  if (!s?.companyName) return null;

  const contact = [s.phone && `Tel: ${s.phone}`, s.email].filter(Boolean).join('  ·  ');
  const reg = [s.cqcProviderId && `CQC: ${s.cqcProviderId}`, s.icoNumber && `ICO: ${s.icoNumber}`].filter(Boolean).join('  ·  ');

  return (
    <div className={`flex items-center gap-4 border-b-2 border-gray-900 pb-2.5 mb-4 ${className}`}>
      {s.logo && <img src={s.logo} alt="" className="max-h-14 max-w-[180px] object-contain" />}
      <div className="leading-tight">
        <p className="text-base font-bold text-gray-900">{s.companyName}</p>
        {s.address && <p className="text-[11px] text-gray-600 whitespace-pre-line">{s.address}</p>}
        {contact && <p className="text-[11px] text-gray-600">{contact}</p>}
        {reg && <p className="text-[11px] text-gray-600">{reg}</p>}
      </div>
    </div>
  );
}
