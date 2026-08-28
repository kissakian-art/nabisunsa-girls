'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { signIn } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, null as { error?: string } | null);

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="card">
        <h1>Marks Portal</h1>
        <p className="sub">Director of Studies office</p>

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
        Parents and students use the school app, not this portal.
      </p>
    </div>
  );
}
