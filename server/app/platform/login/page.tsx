'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { platformSignIn } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export default function PlatformLoginPage() {
  const [state, formAction] = useFormState(platformSignIn, null as { error?: string } | null);

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="card">
        <h1>Midway platform</h1>
        <p className="sub">Schools, billing and access</p>

        {state?.error && <div className="notice error">{state.error}</div>}

        <form action={formAction}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <SubmitButton />
        </form>
      </div>
      <p className="sub" style={{ fontSize: 13, textAlign: 'center' }}>
        This is Midway&rsquo;s own console. School staff sign in at the portal instead.
      </p>
    </div>
  );
}
