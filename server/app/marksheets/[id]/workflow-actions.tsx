'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { transitionAction } from '../../actions';
import type { MarksheetAction } from '../../../domain/marksheet';

const LABELS: Record<MarksheetAction, string> = {
  enter: 'Submit for checking',
  verify: 'Confirm marks are correct',
  publish: 'Release to parents',
  unpublish: 'Withdraw from parents',
  reopen: 'Reopen for correction',
};

/** Actions that change what parents can see get a confirmation step. */
const CONFIRM: Partial<Record<MarksheetAction, string>> = {
  publish: 'Release these marks to parents? They will be notified.',
  unpublish: 'Withdraw these marks from parents? They will no longer be visible.',
  reopen: 'Reopen this marksheet? It will need checking again before release.',
};

function ActionButton({ action, disabled }: { action: MarksheetAction; disabled: boolean }) {
  const { pending } = useFormStatus();
  const danger = action === 'unpublish' || action === 'reopen';
  return (
    <button
      className={`btn ${action === 'publish' ? '' : danger ? 'danger' : 'secondary'}`}
      type="submit"
      disabled={disabled || pending}
      onClick={(event) => {
        const message = CONFIRM[action];
        if (message && !window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? 'Working…' : LABELS[action]}
    </button>
  );
}

export function WorkflowActions({
  marksheetId,
  available,
  canRelease,
}: {
  marksheetId: number;
  available: { action: MarksheetAction; allowed: boolean; reason?: string }[];
  canRelease: boolean;
}) {
  const [state, formAction] = useFormState(
    transitionAction,
    null as { error?: string; ok?: string } | null,
  );

  const allowed = available.filter((a) => a.allowed);

  // Show why the obvious next step is blocked — "3 of 40 students have no
  // mark yet" is the message the office needs. But keep it to one line:
  //  - drop refusals that are only about the current status, since the
  //    status badge already says that and "cannot enter a sheet that is
  //    entered" tells nobody anything;
  //  - collapse repeats, so a role restriction is stated once rather than
  //    once per action.
  const seen = new Set<string>();
  const blocked = available.filter((a) => {
    if (a.allowed || !a.reason) return false;
    if (/^Cannot \w+ a marksheet that is/.test(a.reason)) return false;
    if (seen.has(a.reason)) return false;
    seen.add(a.reason);
    return true;
  });

  return (
    <>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      {allowed.length === 0 && (
        <p className="sub" style={{ margin: '0 0 12px' }}>
          {canRelease
            ? 'Nothing to do on this marksheet right now.'
            : 'Nothing further for the office to do — the Director of Studies takes it from here.'}
        </p>
      )}

      <div className="actions">
        {allowed.map(({ action }) => (
          <form key={action} action={formAction}>
            <input type="hidden" name="marksheetId" value={marksheetId} />
            <input type="hidden" name="action" value={action} />
            <ActionButton action={action} disabled={false} />
          </form>
        ))}
      </div>

      {blocked.length > 0 && (
        <ul className="sub" style={{ marginTop: 16, marginBottom: 0, paddingLeft: 20 }}>
          {blocked.map(({ action, reason }) => (
            <li key={action} style={{ fontSize: 14 }}>
              {reason}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
