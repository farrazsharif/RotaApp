interface Props {
  photo?: string | null;
  firstName: string;
  lastName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
};

// Shows a profile photo if present, otherwise coloured initials.
export default function Avatar({ photo, firstName, lastName, size = 'md', className = '' }: Props) {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  const base = `rounded-full flex-shrink-0 object-cover ${SIZES[size]} ${className}`;

  if (photo) {
    return <img src={photo} alt={`${firstName} ${lastName}`} className={base} />;
  }
  return (
    <div className={`${base} bg-blue-100 text-blue-700 flex items-center justify-center font-bold`}>
      {initials}
    </div>
  );
}
