import { useRef } from 'react';
import { BodyMapPoint, BodyMapView } from '../types';
import { FrontBodySvg, BackBodySvg } from './BodyMapDiagrams';

interface Props {
  value: BodyMapPoint[];
  onChange: (points: BodyMapPoint[]) => void;
  readOnly?: boolean;
}

const VIEWS: { key: BodyMapView; label: string; Diagram: () => JSX.Element; aspect: string }[] = [
  { key: 'front', label: 'Front', Diagram: FrontBodySvg, aspect: 'aspect-[417/1006]' },
  { key: 'back', label: 'Back', Diagram: BackBodySvg, aspect: 'aspect-[444/1046]' },
];

export default function BodyMapPicker({ value, onChange, readOnly }: Props) {
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function handleClick(view: BodyMapView, e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const el = containerRefs.current[view];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onChange([...value, { view, x, y }]);
  }

  function removePoint(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (readOnly) return;
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {VIEWS.map(({ key, label, Diagram, aspect }) => (
        <div key={key}>
          <p className="text-xs font-medium text-gray-600 mb-1 text-center">{label}</p>
          <div
            ref={(el) => { containerRefs.current[key] = el; }}
            onClick={(e) => handleClick(key, e)}
            className={`relative bg-gray-50 border border-gray-200 rounded-lg ${aspect} ${readOnly ? '' : 'cursor-crosshair'}`}
          >
            <Diagram />
            {value.map((p, i) => p.view === key && (
              <button
                key={i}
                type="button"
                onClick={(e) => removePoint(i, e)}
                title={readOnly ? undefined : 'Click to remove'}
                className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-red-600 border border-white shadow"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
