import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../lib/auth';
import { TenantDb } from '../../db/tenant';
import { listTerms, currentTerm } from '../../lib/marksheets';
import { buildClassReportCards } from '../../lib/reports';
import { TopBar } from '../topbar';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket { name: string }
interface GroupRow extends RowDataPacket {
  classId: number;
  className: string;
  streamId: number | null;
  streamName: string | null;
  students: number;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { termId?: string; classId?: string; streamId?: string };
}) {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');

  const terms = await listTerms(db);
  const fallback = await currentTerm(db);
  const term = terms.find((t) => t.id === Number(searchParams.termId)) ?? fallback;

  // Every class-and-stream that has students; a report run is done per group.
  const groups = await db.raw<GroupRow>(
    `SELECT c.id AS classId, c.name AS className,
            st.id AS streamId, st.name AS streamName,
            COUNT(s.id) AS students
       FROM classes c
       LEFT JOIN streams st ON st.class_id = c.id
       JOIN students s
         ON s.class_id = c.id AND s.status = 'active'
        AND (st.id IS NULL OR s.stream_id = st.id)
      WHERE c.school_id = :schoolId
      GROUP BY c.id, st.id
      ORDER BY c.sort_order, c.code, st.name`,
  );

  const selected = groups.find(
    (g) =>
      g.classId === Number(searchParams.classId) &&
      (searchParams.streamId
        ? g.streamId === Number(searchParams.streamId)
        : g.streamId == null),
  );

  const cards = term && selected
    ? await buildClassReportCards(db, term.id, selected.classId, selected.streamId)
    : [];
  const withResults = cards.filter((c) => c.subjects.length > 0).length;

  const linkFor = (g: GroupRow) =>
    `/reports?termId=${term?.id ?? ''}&classId=${g.classId}` +
    (g.streamId ? `&streamId=${g.streamId}` : '');

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/">← Marksheets</Link></p>
        <h1>Report cards</h1>
        <p className="sub">
          Built only from released results, so a card can never show a mark the school
          has not published.
        </p>

        <div className="card">
          <h2>Choose a class</h2>
          {terms.length > 1 && (
            <p className="sub">
              Term:{' '}
              {terms.map((t) => (
                <span key={t.id}>
                  {t.id === term?.id ? (
                    <strong>{t.name}</strong>
                  ) : (
                    <Link href={`/reports?termId=${t.id}`}>{t.name}</Link>
                  )}
                  {'  '}
                </span>
              ))}
            </p>
          )}
          {groups.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              No classes have students yet.
            </p>
          ) : (
            <table>
              <thead><tr><th>Class</th><th>Students</th><th /></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={`${g.classId}-${g.streamId ?? 0}`}>
                    <td>
                      {g.className}{g.streamName ? ` ${g.streamName}` : ''}
                    </td>
                    <td>{g.students}</td>
                    <td><Link href={linkFor(g)}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {term && selected && (
          <div className="card" id="class-summary">
            <h2>
              {selected.className}{selected.streamName ? ` ${selected.streamName}` : ''} ·{' '}
              {term.name}
            </h2>
            <p className="sub">
              {withResults} of {cards.length} students have released results.
            </p>
            <p className="actions">
              <Link
                className="btn"
                href={`/reports/print?termId=${term.id}&classId=${selected.classId}` +
                  (selected.streamId ? `&streamId=${selected.streamId}` : '')}
              >
                Open all {cards.length} cards to print
              </Link>
            </p>
            <table>
              <thead>
                <tr><th>Student</th><th>Subjects</th><th>Average</th><th>Position</th><th /></tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.studentId}>
                    <td>
                      {card.lastName} {card.firstName}
                      <div className="reg">{card.registrationNo}</div>
                    </td>
                    <td>{card.subjectsCounted}</td>
                    <td>{card.average ?? '—'}</td>
                    <td>
                      {card.overallPosition == null
                        ? '—'
                        : `${card.overallPosition} of ${card.groupSize}`}
                    </td>
                    <td>
                      <Link
                        className="student-card-link"
                        href={`/reports/${card.studentId}?termId=${term.id}`}
                      >
                        Open
                      </Link>
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
