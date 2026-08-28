'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveMarksAction } from '../../actions';
import type { StudentMarkRow } from '../../../lib/marksheets';

function SaveButton({ editable }: { editable: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending || !editable}>
      {pending ? 'Saving…' : 'Save marks'}
    </button>
  );
}

/**
 * The marks entry grid.
 *
 * Built for someone typing from a paper sheet: one row per student in the
 * order the register is kept, tab moves down the score column, and marking
 * a student absent clears and disables their score rather than leaving an
 * ambiguous blank.
 */
export function MarksForm({
  marksheetId,
  students,
  editable,
}: {
  marksheetId: number;
  students: StudentMarkRow[];
  editable: boolean;
}) {
  const [state, formAction] = useFormState(
    saveMarksAction,
    null as { error?: string; ok?: string } | null,
  );
  const [absent, setAbsent] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(students.map((s) => [s.studentId, Boolean(s.isAbsent)])),
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="marksheetId" value={marksheetId} />

      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}

      {!editable && (
        <div className="notice info">
          These marks can no longer be edited. Reopen the marksheet to make a correction.
        </div>
      )}

      <table className="marks-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Student</th>
            <th style={{ width: 120 }}>Score</th>
            <th style={{ width: 140 }}>Absent</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => {
            const isAbsent = absent[student.studentId] ?? false;
            return (
              <tr key={student.studentId}>
                {/* The roster the action iterates: a disabled score input is
                    not submitted, so absences need an entry that always is. */}
                <input type="hidden" name="student" value={student.studentId} />
                <td className="reg">{index + 1}</td>
                <td>
                  {student.lastName} {student.firstName}
                  <div className="reg">{student.registrationNo}</div>
                </td>
                <td>
                  <input
                    type="number"
                    name={`score_${student.studentId}`}
                    defaultValue={student.score ?? ''}
                    min={0}
                    max={100}
                    step="0.5"
                    disabled={!editable || isAbsent}
                    className={isAbsent ? 'absent-on' : undefined}
                    aria-label={`Score for ${student.firstName} ${student.lastName}`}
                  />
                </td>
                <td className="absent-cell">
                  <input
                    type="checkbox"
                    id={`absent_${student.studentId}`}
                    name={`absent_${student.studentId}`}
                    defaultChecked={isAbsent}
                    disabled={!editable}
                    onChange={(event) =>
                      setAbsent((prev) => ({
                        ...prev,
                        [student.studentId]: event.target.checked,
                      }))
                    }
                  />
                  <label htmlFor={`absent_${student.studentId}`}>Did not sit</label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editable && (
        <div className="sticky-save">
          <SaveButton editable={editable} />
          <span className="sub" style={{ margin: 0, fontSize: 14 }}>
            You can save part-way and come back to it.
          </span>
        </div>
      )}
    </form>
  );
}
