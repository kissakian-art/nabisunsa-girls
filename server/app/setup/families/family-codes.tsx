'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { formatCode } from '../../../domain/invites';
import {
  issueInvitesAction,
  resetFamilyAction,
  type FamilyActionResult,
} from '../actions';

interface ClassOption { id: number; code: string; name: string }
interface StreamOption { id: number; classId: number; name: string }

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

/**
 * Issuing and printing the slips.
 *
 * The codes appear once, here, in the result of the action that created them
 * — they are stored hashed, so this screen is the only place they can ever be
 * read. That is deliberate (a stolen copy of the table must not be a list of
 * nine hundred working credentials) and it makes the warning below the most
 * important sentence on the page.
 */
export function FamilyCodes({
  classes,
  streams,
  schoolName,
}: {
  classes: ClassOption[];
  streams: StreamOption[];
  schoolName: string;
}) {
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const [issued, issueAction] = useFormState(issueInvitesAction, null as FamilyActionResult | null);
  const [reset, resetAction] = useFormState(resetFamilyAction, null as FamilyActionResult | null);

  const forThisClass = streams.filter((s) => s.classId === classId);
  // Whichever action ran last owns the screen; both produce slips to print.
  const slips = reset?.slips?.length ? reset.slips : issued?.slips ?? [];

  return (
    <>
      <div className="card no-print">
        <h2>Print codes for a class</h2>
        <p className="sub">
          Each girl gets a slip with her registration number and a code. She
          takes it home; a parent types both into the app once and chooses
          their own password.
        </p>

        <form action={issueAction}>
          {issued?.error && <div className="notice error">{issued.error}</div>}
          {issued?.ok && <div className="notice ok">{issued.ok}</div>}

          <div className="field">
            <label htmlFor="classId">Class</label>
            <select
              id="classId"
              name="classId"
              value={classId}
              onChange={(e) => setClassId(Number(e.target.value))}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="streamId">Stream</label>
            <select id="streamId" name="streamId" defaultValue="">
              <option value="">Whole class</option>
              {forThisClass.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="reissue" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input id="reissue" name="reissue" type="checkbox" />
              <span>Reprint for students who already have a code</span>
            </label>
            <p className="reg" style={{ margin: '4px 0 0' }}>
              This cancels the slips already handed out for those students.
              Leave it off to print only for the girls who have none.
            </p>
          </div>

          <Submit label="Generate codes" />
        </form>
      </div>

      <div className="card no-print">
        <h2>A parent who cannot get in</h2>
        <p className="sub">
          There is no way for the office to read or change a family password —
          staff who could do that could sign in as a parent and read her
          daughter&apos;s marks. Withdraw the old access and print a new slip
          instead.
        </p>
        <form action={resetAction}>
          {reset?.error && <div className="notice error">{reset.error}</div>}
          {reset?.ok && <div className="notice ok">{reset.ok}</div>}
          <div className="field">
            <label htmlFor="registrationNo">Registration number</label>
            <input id="registrationNo" name="registrationNo" placeholder="NGSS/2026/042" />
          </div>
          <Submit label="Withdraw access and print a new slip" />
        </form>
      </div>

      {slips.length > 0 && (
        <div className="card" id="slips">
          <div className="no-print">
            <h2>{slips.length} slip(s) to print</h2>
            <div className="notice error">
              <strong>Print these now.</strong> The codes are stored scrambled,
              so this is the only time they can be read. If this page is closed
              they cannot be recovered — only new codes issued, which cancels
              these.
            </div>
            <button className="btn" type="button" onClick={() => window.print()}>
              Print slips
            </button>
          </div>

          <div className="slips">
            {slips.map((slip) => (
              <div className="slip" key={slip.studentId}>
                <div className="slip-school">{schoolName}</div>
                <div className="slip-title">Parent &amp; student app — access slip</div>
                <div className="slip-name">{slip.studentName}</div>
                <div className="slip-class">
                  {slip.className}{slip.streamName ? ` · ${slip.streamName}` : ''}
                </div>
                <table className="slip-fields">
                  <tbody>
                    <tr>
                      <td>Registration number</td>
                      <td><strong>{slip.registrationNo}</strong></td>
                    </tr>
                    <tr>
                      <td>Access code</td>
                      <td><strong className="slip-code">{formatCode(slip.code)}</strong></td>
                    </tr>
                  </tbody>
                </table>
                <ol className="slip-steps">
                  <li>Install the {schoolName} app.</li>
                  <li>Tap <strong>Activate account</strong>.</li>
                  <li>Type the registration number and the code above.</li>
                  <li>Choose your own password. Keep it private.</li>
                </ol>
                <div className="slip-foot">
                  This code works once, and expires on{' '}
                  {new Date(slip.expiresAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  . If it is lost, ask the school office for a new slip.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
