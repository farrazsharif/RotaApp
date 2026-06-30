export default function HospitalIcon({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center h-4 w-4 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none ${className}`}
      title="Hospitalised"
    >
      H
    </span>
  );
}
