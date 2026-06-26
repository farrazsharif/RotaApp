// Simplified body-outline SVGs used as click targets for marking where a
// cream/lotion should be applied. Not anatomically precise — just enough
// to recognize front/back/face regions, matching the classic paper body map.

export function FrontBodySvg() {
  return (
    <svg viewBox="0 0 100 220" className="w-full h-full">
      <g fill="none" stroke="#1f2937" strokeWidth="1.2">
        <circle cx="50" cy="16" r="13" />
        <path d="M44 28 L44 36 M56 28 L56 36" />
        <path d="M30 40 Q50 32 70 40 L74 95 Q60 102 50 102 Q40 102 26 95 Z" />
        <path d="M30 40 L14 90 L18 95 L34 60" />
        <path d="M70 40 L86 90 L82 95 L66 60" />
        <path d="M14 90 L10 130 L16 132 L22 96" />
        <path d="M86 90 L90 130 L84 132 L78 96" />
        <path d="M38 100 L34 160 L40 215 L48 215 L46 160 L50 102 L54 160 L52 215 L60 215 L66 160 L62 100" />
      </g>
    </svg>
  );
}

export function BackBodySvg() {
  return (
    <svg viewBox="0 0 100 220" className="w-full h-full">
      <g fill="none" stroke="#1f2937" strokeWidth="1.2">
        <circle cx="50" cy="16" r="13" />
        <path d="M44 28 L44 36 M56 28 L56 36" />
        <path d="M30 40 Q50 32 70 40 L74 95 Q60 102 50 102 Q40 102 26 95 Z" />
        <path d="M50 45 L50 95" strokeDasharray="3,3" />
        <path d="M30 40 L14 90 L18 95 L34 60" />
        <path d="M70 40 L86 90 L82 95 L66 60" />
        <path d="M14 90 L10 130 L16 132 L22 96" />
        <path d="M86 90 L90 130 L84 132 L78 96" />
        <path d="M38 100 L34 160 L40 215 L48 215 L46 160 L50 102 L54 160 L52 215 L60 215 L66 160 L62 100" />
      </g>
    </svg>
  );
}

export function FaceFrontSvg() {
  return (
    <svg viewBox="0 0 100 110" className="w-full h-full">
      <g fill="none" stroke="#1f2937" strokeWidth="1.2">
        <path d="M50 6 Q78 6 80 40 Q82 65 72 80 Q64 100 50 102 Q36 100 28 80 Q18 65 20 40 Q22 6 50 6 Z" />
        <path d="M30 88 Q40 100 50 100" />
        <path d="M70 88 Q60 100 50 100" />
        <ellipse cx="36" cy="48" rx="4" ry="2.5" />
        <ellipse cx="64" cy="48" rx="4" ry="2.5" />
        <path d="M50 50 L47 62 L53 62" />
        <path d="M40 75 Q50 80 60 75" />
        <path d="M30 42 Q36 38 42 42" />
        <path d="M58 42 Q64 38 70 42" />
      </g>
    </svg>
  );
}

export function FaceSideSvg() {
  return (
    <svg viewBox="0 0 100 110" className="w-full h-full">
      <g fill="none" stroke="#1f2937" strokeWidth="1.2">
        <path d="M30 10 Q70 8 74 35 Q76 45 70 48 Q74 52 70 58 Q72 70 60 84 L56 100 L36 100 L34 86 Q24 80 22 60 Q18 40 22 24 Q24 14 30 10 Z" />
        <ellipse cx="42" cy="44" rx="3.5" ry="2.5" />
        <path d="M68 44 Q73 46 68 50" />
        <path d="M58 50 Q56 58 52 60" />
        <path d="M40 72 Q48 76 56 72" />
        <path d="M34 36 Q40 32 46 36" />
      </g>
    </svg>
  );
}
