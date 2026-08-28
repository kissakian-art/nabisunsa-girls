import { signOut } from './actions';
import type { Session } from '../lib/auth';

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
      <form action={signOut}>
        <button className="btn secondary" type="submit">Sign out</button>
      </form>
    </div>
  );
}
