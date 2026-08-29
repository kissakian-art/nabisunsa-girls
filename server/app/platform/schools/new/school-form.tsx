'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createSchoolAction } from '../../actions';
import { slugProblem, suggestSlug } from '../../../../domain/platform';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create school'}
    </button>
  );
}

export function SchoolForm() {
  const [state, formAction] = useFormState(createSchoolAction, null as { error?: string } | null);

  // The slug follows the name until somebody edits it, then it is theirs.
  // Getting it wrong is expensive — it is compiled into that school's app —
  // so it is shown being derived rather than generated invisibly on submit.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const effectiveSlug = slugEdited ? slug : suggestSlug(name);
  const slugWarning = effectiveSlug ? slugProblem(effectiveSlug) : null;

  return (
    <form action={formAction}>
      {state?.error && <div className="notice error">{state.error}</div>}

      <div className="card">
        <h2>The school</h2>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nabisunsa Girls' Secondary School"
          />
        </div>

        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value);
            }}
          />
          <p className="sub" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Compiled into this school&rsquo;s app as <code>EXPO_PUBLIC_SCHOOL_SLUG</code> and sent
            with every sign-in. Changing it later means rebuilding the app for every parent, so
            settle it now.
          </p>
          {slugWarning && (
            <p className="why" style={{ marginTop: 6 }}>{slugWarning}</p>
          )}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="shortName">Short name</label>
            <input id="shortName" name="shortName" type="text" placeholder="Nabisunsa" />
          </div>
          <div className="field">
            <label htmlFor="district">District</label>
            <input id="district" name="district" type="text" placeholder="Kampala" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="motto">Motto</label>
          <input id="motto" name="motto" type="text" placeholder="Empowerment Through Education" />
        </div>

        <div className="field">
          <label htmlFor="fee">Fee per student per term (UGX)</label>
          <input id="fee" name="fee" type="number" min="0" step="1" placeholder="Leave blank while on trial" />
        </div>
      </div>

      <div className="card">
        <h2>Its first administrator</h2>
        <p className="sub">
          The only account at the new school until it creates others. It can release marks to every
          parent there, so give the password to the school directly rather than sending it on.
        </p>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="adminName">Name</label>
            <input id="adminName" name="adminName" type="text" placeholder="Head Teacher" />
          </div>
          <div className="field">
            <label htmlFor="adminEmail">Email</label>
            <input id="adminEmail" name="adminEmail" type="email" required autoComplete="off" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="adminPassword">Password</label>
          <input
            id="adminPassword"
            name="adminPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
          <p className="sub" style={{ margin: '6px 0 0', fontSize: 13 }}>
            At least 12 characters.
          </p>
        </div>
      </div>

      <div className="actions">
        <SubmitButton />
      </div>
    </form>
  );
}
