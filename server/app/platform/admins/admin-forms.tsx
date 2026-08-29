'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { addAdminAction, setAdminActiveAction, type PlatformActionResult } from '../actions';
import { MIN_ADMIN_PASSWORD } from '../../../domain/platform';

type Result = PlatformActionResult | null;

function Submit({ label, busy, danger }: { label: string; busy: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn${danger ? ' danger' : ''}`} type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export function AddAdminForm() {
  const [state, formAction] = useFormState(addAdminAction, null as Result);

  return (
    <form action={formAction}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="off" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_ADMIN_PASSWORD}
          autoComplete="new-password"
        />
        <p className="sub" style={{ margin: '6px 0 0', fontSize: 13 }}>
          At least {MIN_ADMIN_PASSWORD} characters. This account can suspend any school on the
          platform.
        </p>
      </div>

      <Submit label="Add administrator" busy="Adding…" />
    </form>
  );
}

export function ActiveToggle({
  adminId,
  active,
  isSelf,
}: {
  adminId: number;
  active: boolean;
  isSelf: boolean;
}) {
  const [state, formAction] = useFormState(setAdminActiveAction, null as Result);

  // The console refuses this server-side too; disabling it here just avoids
  // offering a button whose only outcome is an error.
  if (isSelf) return <span className="dim">you</span>;

  return (
    <form action={formAction} style={{ display: 'inline' }}>
      <input type="hidden" name="adminId" value={adminId} />
      <input type="hidden" name="active" value={active ? '0' : '1'} />
      {state?.error && <div className="notice error">{state.error}</div>}
      <Submit
        label={active ? 'Deactivate' : 'Reactivate'}
        busy="Saving…"
        danger={active}
      />
    </form>
  );
}
