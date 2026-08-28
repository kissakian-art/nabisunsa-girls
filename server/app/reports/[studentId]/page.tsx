import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { currentTerm } from '../../../lib/marksheets';
import { buildStudentReportCard } from '../../../lib/reports';
import { TopBar } from '../../topbar';
import { ReportCardView } from '../report-card';
import { PrintButton } from '../print-button';

export const dynamic = 'force-dynamic';

export default async function StudentReportPage({
  params,
  searchParams,
}: {
  params: { studentId: string };
  searchParams: { termId?: string };
}) {
  const session = currentSession();
  if (!session) redirect('/login');

  const studentId = Number(params.studentId);
  if (!Number.isInteger(studentId)) notFound();

  const db = new TenantDb(session.schoolId);
  const term = searchParams.termId
    ? { id: Number(searchParams.termId) }
    : await currentTerm(db);
  if (!term) notFound();

  // Another school's student reads as missing, not forbidden.
  const built = await buildStudentReportCard(db, term.id, studentId);
  if (!built) notFound();

  return (
    <>
      <TopBar session={session} schoolName={built.context.school.name} />
      <div className="wrap">
        <p className="sub no-print" style={{ marginBottom: 8 }}>
          <Link href="/reports">← Report cards</Link>
        </p>
        <p className="actions no-print" style={{ marginBottom: 16 }}>
          <PrintButton label="Print this card" />
        </p>
        <ReportCardView card={built.card} context={built.context} />
      </div>
    </>
  );
}
