import React from 'react';

interface Props {
  title: string;
  icon?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}

// A titled group of form fields: a header row (optional icon + title) with a
// hairline underneath, an optional description, then the fields. Presentational.
export default function FormSection({ title, icon, description, children }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 mb-4">
        {icon && <span className="text-gray-500">{icon}</span>}
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      </div>
      {description && <p className="text-xs text-gray-500 mt-1 mb-3">{description}</p>}
      {children}
    </section>
  );
}
