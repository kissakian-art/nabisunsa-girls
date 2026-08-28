import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { buildClassReportCards, reportContext } from '../../../lib/reports';
import { ReportCardView } from '../report-card';
import { PrintButton } from '../print-button';

export const dynamic = 'force-dynamic';

/**
 * Every card for a class, one per printed page.
 *
 * No top bar: this page exists to go straight to a printer, and the office
 * furniture would waste the first sheet.
 */
export default async function PrintAllPage({
  searchParams,
}: {
  searchParams: { termId?: string; classId?: string; streamId?: string };
}) {
  const session = currentSession();
  if (!session) redirect('/login');

  const termId = Number(searchParams.termId);
  const classId = Number(searchParams.classId);
  const streamId = searchParams.streamId ? Number(searchParams.streamId) : null;
  if (!Number.isInteger(termId) || !Number.isInteger(classId)) notFound();

  const db = new TenantDb(session.schoolId);
  const cards = await buildClassReportCards(db, termId, classId, streamId);
  if (cards.length === 0) notFound();

  const context = await reportContext(
    db, termId, cards[0].className, cards[0].streamName,
  );

  return (
    <div className="wrap">
      <div className="no-print actions" style={{ padding: '16px 0' }}>
        <Link href="/reports">← Report cards</Link>
        <PrintButton label={`Print all ${cards.length} cards`} />
        <span className="sub" style={{ margin: 0, fontSize: 14 }}>
          One card per page. Students with nothing released still get a card.
        </span>
      </div>
      {cards.map((card) => (
        <ReportCardView key={card.studentId} card={card} context={context} />
      ))}
    </div>
  );
}
