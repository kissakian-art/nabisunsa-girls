import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPlatformSession } from '../../../../lib/platform-auth';
import { PlatformTopBar } from '../../topbar';
import { SchoolForm } from './school-form';

export const dynamic = 'force-dynamic';

export default function NewSchoolPage() {
  const session = currentPlatformSession();
  if (!session) redirect('/platform/login');

  return (
    <>
      <PlatformTopBar session={session} />
      <div className="wrap" style={{ maxWidth: 760 }}>
        <p className="sub" style={{ marginBottom: 8 }}>
          <Link href="/platform">← Schools</Link>
        </p>
        <h1>Add a school</h1>
        <p className="sub">
          Creates the school on trial, with the Ugandan 20/80 weighting and the standard grading
          scale, plus its first administrator. Everything else — classes, subjects, class lists —
          the school does itself in Setup.
        </p>
        <SchoolForm />
      </div>
    </>
  );
}
