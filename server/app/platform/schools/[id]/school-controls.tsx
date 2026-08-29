'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { setFeeAction, setStatusAction, type PlatformActionResult } from '../../actions';
import {
  SCHOOL_STATUSES,
  STATUS_CONSEQUENCE,
  STATUS_LABEL,
  type SchoolStatus,
} from '../../../../domain/platform';

function Submit({ label, busy, danger }: { label: string; busy: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn${danger ? ' danger' : ''}`} type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

type Result = PlatformActionResult | null;

export function StatusControl({
  schoolId,
  current,
}: {
  schoolId: number;
  current: SchoolStatus;
}) {
  const [state, formAction] = useFormState(setStatusAction, null as Result);
  const [target, setTarget] = useState<SchoolStatus>(current);

  const turningOff = target === 'suspended' || target === 'closed';

  return (
    <form action={formAction}>
      <input type="hidden" name="schoolId" value={schoolId} />

      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      <div className="field">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          name="status"
          value={target}
          onChange={(e) => setTarget(e.target.value as SchoolStatus)}
        >
          {SCHOOL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        {/* The question the person clicking actually has is what happens to
            the school, so answer it before they click rather than after. */}
        <p className="sub" style={{ margin: '6px 0 0', fontSize: 13 }}>
          {STATUS_CONSEQUENCE[target]}
        </p>
      </div>

      {turningOff && (
        <div className="field">
          <label htmlFor="reason">Reason</label>
          <input id="reason" name="reason" type="text" required placeholder="Unpaid since March" />
          <p className="sub" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Recorded against the school and shown here. Nobody at the school sees it.
          </p>
        </div>
      )}

      <Submit
        label={target === current ? 'Status unchanged' : `Change to ${STATUS_LABEL[target].toLowerCase()}`}
        busy="Saving…"
        danger={turningOff}
      />
    </form>
  );
}

export function FeeControl({
  schoolId,
  fee,
}: {
  schoolId: number;
  fee: number | null;
}) {
  const [state, formAction] = useFormState(setFeeAction, null as Result);

  return (
    <form action={formAction}>
      <input type="hidden" name="schoolId" value={schoolId} />

      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      <div className="field">
        <label htmlFor="fee">Fee per student per term (UGX)</label>
        <input
          id="fee"
          name="fee"
          type="number"
          min="0"
          step="1"
          defaultValue={fee ?? ''}
          placeholder="Blank while on trial"
        />
      </div>

      <Submit label="Save fee" busy="Saving…" />
    </form>
  );
}
