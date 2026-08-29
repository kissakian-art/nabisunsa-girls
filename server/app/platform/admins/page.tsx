import { redirect } from 'next/navigation';
import { currentPlatformSession } from '../../../lib/platform-auth';
import { PlatformDb } from '../../../db/tenant';
import { listPlatformAdmins } from '../../../lib/platform';
import { PlatformTopBar } from '../topbar';
import { ActiveToggle, AddAdminForm } from './admin-forms';

export const dynamic = 'force-dynamic';

const date = (value: Date | null) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

export default async function AdminsPage() {
  const session = currentPlatformSession();
  if (!session) redirect('/platform/login');

  const admins = await listPlatformAdmins(new PlatformDb());

  return (
    <>
      <PlatformTopBar session={session} />
      <div className="wrap" style={{ maxWidth: 900 }}>
        <h1>Platform administrators</h1>
        <p className="sub">
          Midway&rsquo;s own staff. These accounts are not attached to any school and cannot sign
          into the school portal or the family app — they live in a different table entirely.
        </p>

        <div className="card">
          <h2>Who has access</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Last sign-in</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td>
                    {admin.display_name}
                    {!admin.is_active && <span className="dim"> · deactivated</span>}
                  </td>
                  <td className="dim">{admin.email}</td>
                  <td className={admin.last_login_at ? '' : 'dim'}>
                    {admin.last_login_at ? date(admin.last_login_at) : 'never'}
                  </td>
                  <td className="dim">{date(admin.created_at)}</td>
                  <td>
                    <ActiveToggle
                      adminId={admin.id}
                      active={!!admin.is_active}
                      isSelf={admin.id === session.platformUserId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Add an administrator</h2>
          <p className="sub">
            There is no password reset here and none by email. An administrator who loses their
            password is replaced by adding a new account and deactivating the old one, which leaves
            a trail; a reset button on a console this powerful would not.
          </p>
          <AddAdminForm />
        </div>
      </div>
    </>
  );
}
