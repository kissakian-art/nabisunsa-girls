'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  createAnnouncementAction,
  publishAnnouncementAction,
  type AnnouncementActionResult,
} from './actions';

interface ClassOption { id: number; code: string; name: string }
interface StreamOption { id: number; classId: number; name: string }

function Submit({ label, confirm }: { label: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn"
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

/** Writing one. It is saved as a draft; sending is a separate, deliberate act. */
export function AnnouncementComposer({
  classes,
  streams,
}: {
  classes: ClassOption[];
  streams: StreamOption[];
}) {
  const [state, action] = useFormState(
    createAnnouncementAction,
    null as AnnouncementActionResult | null,
  );
  const [audience, setAudience] = useState('all');
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const forThisClass = streams.filter((s) => s.classId === classId);

  return (
    <div className="card">
      <h2>Write an announcement</h2>
      <form action={action}>
        {state?.error && <div className="notice error">{state.error}</div>}
        {state?.ok && <div className="notice ok">{state.ok}</div>}

        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" maxLength={200} required />
        </div>

        <div className="field">
          <label htmlFor="body">Message</label>
          <textarea
            id="body"
            name="body"
            rows={6}
            required
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 15,
            }}
          />
          <p className="reg" style={{ margin: '4px 0 0' }}>
            The first sentence is what appears on the phone; the rest is read
            in the app.
          </p>
        </div>

        <div className="field">
          <label htmlFor="audience">Who it is for</label>
          <select
            id="audience"
            name="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="all">Every family</option>
            <option value="class">One class</option>
            <option value="stream">One stream</option>
          </select>
        </div>

        {(audience === 'class' || audience === 'stream') && (
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
        )}

        {audience === 'stream' && (
          <div className="field">
            <label htmlFor="streamId">Stream</label>
            <select id="streamId" name="streamId">
              {forThisClass.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="isPinned" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input id="isPinned" name="isPinned" type="checkbox" />
            <span>Keep at the top of the list</span>
          </label>
        </div>

        <Submit label="Save as draft" />
      </form>
    </div>
  );
}

/** Sending one. The confirmation names the cost of getting it wrong. */
export function SendButton({ id }: { id: number }) {
  const [state, action] = useFormState(
    publishAnnouncementAction,
    null as AnnouncementActionResult | null,
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
      <Submit
        label="Send to parents"
        confirm="This goes to every parent's phone straight away and cannot be recalled. Send it?"
      />
    </form>
  );
}
