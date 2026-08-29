import Link from 'next/link';
import { platformSignOut } from './actions';
import type { PlatformSession } from '../../lib/platform-auth';

/**
 * Visibly not a school's topbar.
 *
 * Someone who administers several schools spends the day moving between
 * them; a console that looked like a school dashboard is one glance away
 * from a suspension applied to the wrong tenant.
 */
export function PlatformTopBar({ session }: { session: PlatformSession }) {
  return (
    <div className="topbar platform">
      <div>
        <div className="school">Midway platform</div>
        <div className="who">{session.name} · Platform administrator</div>
      </div>
      <div className="actions">
        <Link href="/platform">Schools</Link>
        <Link href="/platform/admins">Administrators</Link>
        <form action={platformSignOut}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </div>
    </div>
  );
}
