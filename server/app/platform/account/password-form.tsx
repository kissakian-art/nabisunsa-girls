'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePasswordAction, type PlatformActionResult } from '../actions';
import { MIN_ADMIN_PASSWORD } from '../../../domain/platform';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Changing…' : 'Change password'}
    </button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useFormState(
    changePasswordAction,
    null as PlatformActionResult | null,
  );

  return (
    <form action={formAction}>
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      <div className="field">
        <label htmlFor="current">Current password</label>
        <input
          id="current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
        />
        {/* Asked for even though you are already signed in: a session left
            open on an unlocked machine should not be enough to lock its
            owner out of the platform. */}
      </div>

      <div className="field">
        <label htmlFor="next">New password</label>
        <input
          id="next"
          name="next"
          type="password"
          required
          minLength={MIN_ADMIN_PASSWORD}
          autoComplete="new-password"
        />
        <p className="sub" style={{ margin: '6px 0 0', fontSize: 13 }}>
          At least {MIN_ADMIN_PASSWORD} characters. Length is the only rule —
          a long one you will remember beats a short one with symbols in it.
        </p>
      </div>

      <div className="field">
        <label htmlFor="confirmation">New password again</label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          required
          minLength={MIN_ADMIN_PASSWORD}
          autoComplete="new-password"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
