import React from 'react';

interface Props {
  label?: string;
  htmlFor?: string;
  optional?: boolean;
  help?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

// A labelled form field wrapper. Renders an optional <label>, the control
// ({children}), and either an error message (with a small ⚠) or muted help
// text beneath it. Presentational only — the control keeps its own binding.
export default function Field({ label, htmlFor, optional, help, error, className, children }: Props) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800 mb-1.5">
          {label}
          {optional && <span className="text-gray-400 font-normal"> (optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-gray-500 mt-1.5">{help}</p>
      ) : null}
    </div>
  );
}
