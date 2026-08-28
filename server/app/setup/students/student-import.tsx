'use client';

import { useState } from 'react';
import { SetupForm } from '../setup-form';
import { importStudentsAction } from '../actions';

interface ClassOption { id: number; code: string; name: string }
interface StreamOption { id: number; classId: number; name: string }

const EXAMPLE = `NGSS/2026/001, Nakato, Aisha
NGSS/2026/002, Auma, Brenda
NGSS/2026/003, Namuli, Cynthia`;

/**
 * Bulk student import.
 *
 * The stream list narrows to the chosen class, because offering S4's streams
 * while S1 is selected is how students end up in the wrong place.
 */
export function StudentImport({
  classes,
  streams,
}: {
  classes: ClassOption[];
  streams: StreamOption[];
}) {
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const forThisClass = streams.filter((s) => s.classId === classId);

  return (
    <SetupForm action={importStudentsAction} label="Import students">
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
          <option value="">Whole class (no stream)</option>
          {forThisClass.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="list">Class list</label>
        <p className="reg" style={{ margin: '0 0 6px' }}>
          One student per line: registration number, last name, first name.
          Commas or tabs both work, so a spreadsheet can be pasted directly.
        </p>
        <textarea
          id="list"
          name="list"
          rows={12}
          required
          placeholder={EXAMPLE}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 15, fontFamily: 'ui-monospace, monospace',
          }}
        />
      </div>

      <p className="sub" style={{ fontSize: 14 }}>
        A registration number already on the roll is skipped, so re-pasting an updated
        list adds only the new students.
      </p>
    </SetupForm>
  );
}
