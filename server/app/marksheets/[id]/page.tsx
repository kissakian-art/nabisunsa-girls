import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession, canRelease } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { getMarksheet, getMarksheetStudents } from '../../../lib/marksheets';
import { evaluateTransition } from '../../../domain/marksheet';
import { TopBar } from '../../topbar';
import { MarksForm } from './marks-form';
import { WorkflowActions } from './workflow-actions';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket {
  name: string;
}

export default async function MarksheetPage({ params }: { params: { id: string } }) {
  const session = currentSession();
  if (!session) redirect('/login');

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const db = new TenantDb(session.schoolId);
  const sheet = await getMarksheet(db, id);
  // A marksheet belonging to another school reads as missing rather than
  // forbidden — there is no reason to confirm it exists.
  if (!sheet) notFound();

  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const students = await getMarksheetStudents(db, id);

  const state = {
    status: sheet.status,
    expectedStudents: Number(sheet.expectedStudents),
    recordedMarks: Number(sheet.recordedMarks),
    enteredBy: sheet.enteredBy,
    verifiedBy: sheet.verifiedBy,
  };

  const actor = { actorId: session.userId, actorRole: session.role };
  const available = (['enter', 'verify', 'publish', 'unpublish', 'reopen'] as const).map(
    (action) => ({ action, ...evaluateTransition(state, { action, ...actor }) }),
  );

  const editable = sheet.status === 'draft';

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}>
          <Link href="/">← All marksheets</Link>
        </p>

        <h1>
          {sheet.className}
          {sheet.streamName ? ` ${sheet.streamName}` : ''} · {sheet.subjectName}
        </h1>
        <p className="sub">
          {sheet.assessmentName} · {sheet.termName} ·{' '}
          <span className={`badge ${sheet.status}`}>{sheet.status}</span>
        </p>

        {sheet.status === 'published' && (
          <div className="notice ok">
            Released to parents. Withdraw it first if a mark needs correcting.
          </div>
        )}
        {sheet.status === 'entered' && (
          <div className="notice info">
            Entered by {sheet.enteredByName ?? 'office staff'} and waiting to be checked by
            someone else.
          </div>
        )}
        {sheet.status === 'verified' && (
          <div className="notice info">
            Checked and ready. Parents cannot see these marks until they are released.
          </div>
        )}

        <div className="card">
          <h2>
            Marks ({sheet.recordedMarks} of {sheet.expectedStudents} recorded)
          </h2>
          {students.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              No active students in this class.
            </p>
          ) : (
            <MarksForm marksheetId={id} students={students} editable={editable} />
          )}
        </div>

        <div className="card">
          <h2>Next steps</h2>
          <WorkflowActions
            marksheetId={id}
            available={available}
            canRelease={canRelease(session.role)}
          />
        </div>
      </div>
    </>
  );
}
