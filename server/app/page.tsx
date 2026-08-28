import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession, canRelease } from '../lib/auth';
import { TenantDb } from '../db/tenant';
import { listMarksheets, currentTerm } from '../lib/marksheets';
import { summariseTerm } from '../domain/marksheet';
import { TopBar } from './topbar';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket {
  name: string;
}

export default async function Dashboard() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>(
    'SELECT name FROM schools WHERE id = :schoolId',
  );

  const term = await currentTerm(db);
  const sheets = term ? await listMarksheets(db, { termId: term.id }) : [];
  const progress = summariseTerm(sheets);

  const needsAttention = sheets.filter((s) => s.status !== 'published');

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <h1>{term ? term.name : 'No term set up'}</h1>
        <p className="sub">
          {canRelease(session.role)
            ? 'Enter marks, check them, and release results to parents.'
            : 'Enter marks from the submitted marksheets. The Director of Studies releases them.'}
        </p>

        <div className="card">
          <h2>This term</h2>
          <div className="progress">
            <div className="stat">
              <div className="n">{progress.total}</div>
              <div className="l">Marksheets</div>
            </div>
            <div className="stat">
              <div className="n">{progress.draft}</div>
              <div className="l">Not entered</div>
            </div>
            <div className="stat">
              <div className="n">{progress.entered}</div>
              <div className="l">Awaiting check</div>
            </div>
            <div className="stat">
              <div className="n">{progress.verified}</div>
              <div className="l">Ready to release</div>
            </div>
            <div className="stat">
              <div className="n">{progress.published}</div>
              <div className="l">Released to parents</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Outstanding ({needsAttention.length})</h2>
          {needsAttention.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              {progress.total === 0
                ? 'No marksheets have been set up for this term yet.'
                : 'Everything for this term has been released to parents.'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Assessment</th>
                  <th>Marks</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {needsAttention.map((sheet) => (
                  <tr key={sheet.id}>
                    <td>
                      {sheet.className}
                      {sheet.streamName ? ` ${sheet.streamName}` : ''}
                    </td>
                    <td>{sheet.subjectName}</td>
                    <td>{sheet.assessmentName}</td>
                    <td>
                      {sheet.recordedMarks} / {sheet.expectedStudents}
                    </td>
                    <td>
                      <span className={`badge ${sheet.status}`}>{sheet.status}</span>
                    </td>
                    <td>
                      <Link href={`/marksheets/${sheet.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {progress.published > 0 && (
          <div className="card">
            <h2>Released ({progress.published})</h2>
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Assessment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sheets
                  .filter((s) => s.status === 'published')
                  .map((sheet) => (
                    <tr key={sheet.id}>
                      <td>
                        {sheet.className}
                        {sheet.streamName ? ` ${sheet.streamName}` : ''}
                      </td>
                      <td>{sheet.subjectName}</td>
                      <td>{sheet.assessmentName}</td>
                      <td>
                        <Link href={`/marksheets/${sheet.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
