import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { canRelease, currentSession } from '../../lib/auth';
import { TenantDb } from '../../db/tenant';
import { listAnnouncements } from '../../lib/announcements';
import { listClasses } from '../../lib/setup';
import { TopBar } from '../topbar';
import { AnnouncementComposer, SendButton } from './composer';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket { name: string }
interface StreamRow extends RowDataPacket { id: number; classId: number; name: string }

export default async function AnnouncementsPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const announcements = await listAnnouncements(db);
  const classes = await listClasses(db);
  const streams = await db.raw<StreamRow>(
    `SELECT id, class_id AS classId, name FROM streams
      WHERE school_id = :schoolId ORDER BY name`,
  );

  const mayPublish = canRelease(session.role);

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/">← Marksheets</Link></p>
        <h1>Announcements</h1>
        <p className="sub">
          What the school tells parents. Every family with the app gets it on
          their phone, at no cost per message.
        </p>

        {mayPublish && (
          <AnnouncementComposer
            classes={classes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
            streams={streams.map((s) => ({ id: s.id, classId: s.classId, name: s.name }))}
          />
        )}

        <div className="card">
          <h2>Written so far</h2>
          {announcements.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>Nothing yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Announcement</th><th>For</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {announcements.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.title}</strong>
                      {a.isPinned ? <span className="reg"> · pinned</span> : null}
                      {a.isUrgent ? <span className="reg"> · urgent</span> : null}
                      <div className="reg">{a.authorName ?? 'School'}</div>
                    </td>
                    <td>
                      {a.audience === 'class' || a.audience === 'stream'
                        ? `${a.className ?? ''}${a.streamName ? ` ${a.streamName}` : ''}`
                        : 'Everyone'}
                    </td>
                    <td>
                      {a.publishedAt ? (
                        <span className="badge published">sent</span>
                      ) : (
                        <span className="badge draft">draft</span>
                      )}
                    </td>
                    <td>
                      {!a.publishedAt && mayPublish ? <SendButton id={a.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="sub" style={{ marginBottom: 0 }}>
            Sending cannot be undone — it is on every parent&apos;s phone the
            moment it goes. Write it as a draft, read it once more, then send.
          </p>
        </div>
      </div>
    </>
  );
}
