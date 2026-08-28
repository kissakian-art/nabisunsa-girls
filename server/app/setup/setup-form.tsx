'use client';

import { useFormState, useFormStatus } from 'react-dom';

export interface ActionResult {
  ok?: string;
  error?: string;
  parseErrors?: { line: number; text: string; problem: string }[];
}

type Action = (prev: unknown, formData: FormData) => Promise<ActionResult>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

/**
 * A form bound to a server action, showing whatever it reports back.
 *
 * Parse errors are listed individually with their line numbers: telling an
 * office "3 rows were wrong" without saying which is useless when the paste
 * was 200 lines long.
 */
export function SetupForm({
  action,
  label,
  children,
}: {
  action: Action;
  label: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useFormState(action, null as ActionResult | null);

  return (
    <form action={formAction}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      {state?.parseErrors && state.parseErrors.length > 0 && (
        <div className="notice error">
          <strong>{state.parseErrors.length} row(s) could not be read:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {state.parseErrors.slice(0, 10).map((e) => (
              <li key={e.line} style={{ fontSize: 14 }}>
                Line {e.line}: {e.problem} — <code>{e.text}</code>
              </li>
            ))}
            {state.parseErrors.length > 10 && (
              <li style={{ fontSize: 14 }}>…and {state.parseErrors.length - 10} more</li>
            )}
          </ul>
        </div>
      )}

      {children}
      <Submit label={label} />
    </form>
  );
}
