import { redirect } from 'next/navigation';
import { verifyPlatformSession } from '../../../lib/platform-auth';
import { PlatformTopBar } from '../topbar';
import { PasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await verifyPlatformSession();
  if (!session) redirect('/platform/login');

  return (
    <>
      <PlatformTopBar session={session} />
      <div className="wrap" style={{ maxWidth: 560 }}>
        <h1>Your account</h1>
        <p className="sub">
          {session.name} · {session.email}
        </p>

        <div className="card">
          <h2>Change your password</h2>
          <p className="sub">
            This is the only credential operation the console has, and it only
            ever acts on your own account. Nobody here can set anybody else&rsquo;s
            password — not even another platform administrator.
          </p>
          <PasswordForm />
        </div>

        <div className="card">
          <h2>What changing it does</h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            Any other console session opened with the old password stops working
            immediately — another browser, another machine, one you forgot to sign
            out of. This one stays signed in. That is the point: the usual reason
            to change a password is that somebody else has it.
          </p>
        </div>
      </div>
    </>
  );
}
