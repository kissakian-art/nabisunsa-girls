'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveGradingAction, type GradingActionResult } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save and recompute'}
    </button>
  );
}

/**
 * The two settings here are the ones that differ between schools that both
 * say "20 and 80", so they are explained in the words a Director of Studies
 * would use rather than named and left.
 */
export function GradingForm({
  caWeight,
  eotWeight,
  caBestOf,
  formativeSource,
  missingExamRule,
}: {
  caWeight: number;
  eotWeight: number;
  caBestOf: number | null;
  formativeSource: 'computed' | 'entered';
  missingExamRule: 'excluded' | 'zero';
}) {
  const [state, action] = useFormState(
    saveGradingAction,
    null as GradingActionResult | null,
  );
  const [source, setSource] = useState(formativeSource);
  const [ca, setCa] = useState(caWeight);

  return (
    <div className="card">
      <h2>How a mark is made</h2>
      <form action={action}>
        {state?.error && <div className="notice error">{state.error}</div>}
        {state?.ok && <div className="notice ok">{state.ok}</div>}

        <div className="field">
          <label htmlFor="caWeight">Coursework weight (%)</label>
          <input
            id="caWeight"
            name="caWeight"
            type="number"
            min={0}
            max={100}
            value={ca}
            onChange={(e) => setCa(Number(e.target.value))}
          />
          <p className="reg" style={{ margin: '4px 0 0' }}>
            The exam takes the rest: {100 - ca}%.
          </p>
        </div>

        <div className="field">
          <label htmlFor="formativeSource">Where the coursework mark comes from</label>
          <select
            id="formativeSource"
            name="formativeSource"
            value={source}
            onChange={(e) => setSource(e.target.value as 'computed' | 'entered')}
          >
            <option value="computed">
              Worked out from the coursework marks entered during the term
            </option>
            <option value="entered">
              The office types one mark out of {ca}, from the teacher&apos;s sheet
            </option>
          </select>
          <p className="reg" style={{ margin: '6px 0 0' }}>
            {source === 'entered'
              ? `Marks on a coursework sheet are read as being out of ${ca}, not out of 100.` +
                ' Nothing is averaged or scaled — the number the school decided is the number used.'
              : 'Coursework marks are entered out of 100, averaged, and then weighted.'}
          </p>
        </div>

        {source === 'computed' && (
          <div className="field">
            <label htmlFor="caBestOf">Count only the best</label>
            <input
              id="caBestOf"
              name="caBestOf"
              type="number"
              min={1}
              max={20}
              defaultValue={caBestOf ?? ''}
              placeholder="all of them"
            />
            <p className="reg" style={{ margin: '4px 0 0' }}>
              Leave empty to average every coursework mark. Nabisunsa counted
              the best 3.
            </p>
          </div>
        )}

        <div className="field">
          <label htmlFor="missingExamRule">When a student did not sit the exam</label>
          <select
            id="missingExamRule"
            name="missingExamRule"
            defaultValue={missingExamRule}
          >
            <option value="excluded">
              Leave the subject unmarked until the paper is sat
            </option>
            <option value="zero">Score the paper as nothing</option>
          </select>
          <p className="reg" style={{ margin: '6px 0 0' }}>
            Both are used by real schools. The first protects a girl who was
            ill; the second is what a school means when it prints a total with
            no exam behind it.
          </p>
        </div>

        <Submit />
        <p className="sub" style={{ marginBottom: 0 }}>
          Saving recomputes every released result for the current term. Nothing
          reaches a parent that was not already released.
        </p>
      </form>
    </div>
  );
}
