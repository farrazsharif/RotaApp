// Choosing which resident a record is for, on a Supported Living house visit.
//
// One visit covers the whole house, but a care record belongs to one person.
// Picking a resident scopes the entire screen — the notes, the MAR chart, the
// tasks, anything reported — so the carer is always writing into one named
// file rather than choosing per record and mis-filing one of them.
//
// Nothing is selected to begin with, on purpose. A default would be the
// resident whose record gets written when a tired carer taps straight into the
// note at the end of a night shift.

interface Resident {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  residents: Resident[];
  value: string;
  onChange: (id: string) => void;
  houseName?: string | null;
}

export default function ResidentSwitcher({ residents, value, onChange, houseName }: Props) {
  if (residents.length === 0) return null;

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
        {houseName || 'This house'} · who are you recording for?
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {residents.map((r) => {
          const on = r.id === value;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(on ? '' : r.id)}
              className={`rounded-xl px-3 py-2.5 text-left border text-sm font-semibold active:scale-[0.99] ${
                on
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-blue-200 text-gray-800'
              }`}
            >
              {r.firstName}
              <span className={`block text-xs font-normal ${on ? 'text-blue-100' : 'text-gray-500'}`}>
                {r.lastName}
              </span>
            </button>
          );
        })}
      </div>
      {!value && (
        <p className="mt-2 text-xs text-blue-900">
          Pick a resident to see their tasks, medication and notes. Everything you record goes in
          their file.
        </p>
      )}
    </div>
  );
}
