'use client';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button className="btn no-print" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
