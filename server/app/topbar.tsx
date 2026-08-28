import Link from 'next/link';
import { signOut } from './actions';
import { canRelease, type Session } from '../lib/auth';

const ROLE_LABEL: Record<string, string> = {
  dos: 'Director of Studies',
  dos_staff: 'DoS office',
  school_admin: 'Administrator',
};

export function TopBar({ session, schoolName }: { session: Session; schoolName: string }) {
  return (
    <div className="topbar">
      <div>
        <div className="school">{schoolName}</div>
        <div className="who">
          {session.name} · {ROLE_LABEL[session.role] ?? session.role}
        </div>
      </div>
      <div className="actions">
        {/* Report cards are the school's own output, so the whole office
            can print them. Setup is administration and is not theirs. */}
        <Link href="/reports">Report cards</Link>
        {canRelease(session.role) && <Link href="/setup">Setup</Link>}
        <form action={signOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </div>
    </div>
  );
}
