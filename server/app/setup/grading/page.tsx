import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { currentSession } from '../../../lib/auth';
import { TenantDb } from '../../../db/tenant';
import { TopBar } from '../../topbar';
import { GradingForm } from './grading-form';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket { name: string }
interface ConfigRow extends RowDataPacket {
  ca_weight: number;
  eot_weight: number;
  ca_best_of: number | null;
  formative_source: 'computed' | 'entered';
  missing_exam_rule: 'excluded' | 'zero';
}
interface ScaleRow extends RowDataPacket {
  grade: string;
  minScore: number;
  label: string | null;
}

export default async function GradingPage() {
  const session = currentSession();
  if (!session) redirect('/login');

  const db = new TenantDb(session.schoolId);
  const [school] = await db.raw<SchoolRow>('SELECT name FROM schools WHERE id = :schoolId');
  const config = await db.selectOne<ConfigRow>('school_grading_config');
  const scale = await db.raw<ScaleRow>(
    `SELECT grade, min_score AS minScore, label FROM grading_scale
      WHERE school_id = :schoolId ORDER BY min_score DESC`,
  );

  return (
    <>
      <TopBar session={session} schoolName={school?.name ?? 'School'} />
      <div className="wrap">
        <p className="sub" style={{ marginBottom: 8 }}><Link href="/setup">← Setup</Link></p>
        <h1>Grading</h1>
        <p className="sub">
          How this school turns coursework and an exam into one mark. Changing
          any of it recomputes every released result for the current term.
        </p>

        {config ? (
          <GradingForm
            caWeight={Number(config.ca_weight)}
            eotWeight={Number(config.eot_weight)}
            caBestOf={config.ca_best_of == null ? null : Number(config.ca_best_of)}
            formativeSource={config.formative_source ?? 'computed'}
            missingExamRule={config.missing_exam_rule ?? 'excluded'}
          />
        ) : (
          <div className="card">
            <p className="sub" style={{ margin: 0 }}>
              This school has no grading configuration. It is normally created
              with the school; ask Midway to add one.
            </p>
          </div>
        )}

        <div className="card">
          <h2>Grade boundaries</h2>
          <p className="sub">
            A final mark takes the highest grade whose boundary it reaches.
          </p>
          <table>
            <thead><tr><th>Grade</th><th>From</th><th>Label</th></tr></thead>
            <tbody>
              {scale.map((row) => (
                <tr key={row.grade}>
                  <td><strong>{row.grade}</strong></td>
                  <td>{Number(row.minScore)}</td>
                  <td>{row.label ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
