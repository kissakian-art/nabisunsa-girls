/**
 * Tenant isolation tests, run against a real MySQL server.
 *
 * These are the most important tests in the codebase. Cross-tenant leakage
 * is the failure that ends the business, and it cannot be verified by
 * reading code — only by creating two schools and trying to reach across.
 *
 * Set TEST_DATABASE_URL to run them, e.g.
 *   TEST_DATABASE_URL='mysql://root@localhost/midway_test' npx jest server/db
 * They skip when it is unset, so the suite stays green without a database.
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { TenantDb, PlatformDb, TenantScopeError, closePool } from '../tenant';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

describeDb('tenant isolation', () => {
  let pool: mysql.Pool;
  let nabisunsa: TenantDb;
  let seeta: TenantDb;
  let nabisunsaId: number;
  let seetaId: number;

  beforeAll(async () => {
    // Create the database first, on a connection that does not name it —
    // otherwise the pool fails to connect to a schema that does not exist yet.
    const parsed = new URL(DB_URL as string);
    const dbName = parsed.pathname.replace('/', '');
    const admin = await mysql.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      multipleStatements: false,
    });
    await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await admin.query(`CREATE DATABASE \`${dbName}\``);
    await admin.end();

    pool = mysql.createPool({ uri: DB_URL, connectionLimit: 4, decimalNumbers: true });

    // Rebuild the schema from the migration that ships to production, so
    // these tests exercise the real DDL rather than a hand-written copy.
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '001_init.sql'),
      'utf8',
    );
    const conn = await pool.getConnection();
    for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await conn.query(statement);
    }

    const [a] = await conn.query<mysql.ResultSetHeader>(
      "INSERT INTO schools (slug, name, status) VALUES ('nabisunsa','Nabisunsa Girls','active')",
    );
    const [b] = await conn.query<mysql.ResultSetHeader>(
      "INSERT INTO schools (slug, name, status) VALUES ('seeta','Seeta High','active')",
    );
    nabisunsaId = a.insertId;
    seetaId = b.insertId;
    conn.release();

    nabisunsa = new TenantDb(nabisunsaId, pool);
    seeta = new TenantDb(seetaId, pool);

    // Each school gets its own S4 class and a student.
    const nClass = await nabisunsa.insert('classes', {
      code: 'S4', name: 'Senior Four', level: 'O-Level',
    });
    const sClass = await seeta.insert('classes', {
      code: 'S4', name: 'Senior Four', level: 'O-Level',
    });
    await nabisunsa.insert('students', {
      registration_no: 'NGSS/2026/001', first_name: 'Aisha', last_name: 'Nakato',
      class_id: nClass, level: 'O-Level',
    });
    await seeta.insert('students', {
      registration_no: 'SH/2026/001', first_name: 'Brenda', last_name: 'Auma',
      class_id: sClass, level: 'O-Level',
    });
  });

  afterAll(async () => {
    await pool?.end();
    await closePool();
  });

  it('each school sees only its own students', async () => {
    const n = await nabisunsa.select<any>('students', { orderBy: 'id ASC' });
    const s = await seeta.select<any>('students', { orderBy: 'id ASC' });
    expect(n).toHaveLength(1);
    expect(s).toHaveLength(1);
    expect((n[0] as any).first_name).toBe('Aisha');
    expect((s[0] as any).first_name).toBe('Brenda');
  });

  it('the same registration number can exist at two schools', async () => {
    // Uniqueness is per school, not global — two schools may both use
    // "001", and that must not collide.
    const cls = await seeta.select<any>('classes');
    const id = await seeta.insert('students', {
      registration_no: 'NGSS/2026/001',
      first_name: 'Different', last_name: 'Student',
      class_id: cls[0].id, level: 'O-Level',
    });
    expect(id).toBeGreaterThan(0);
    // Leave the fixtures as we found them, so later tests stay independent.
    await seeta.delete('students', { id });
  });

  const seetaStudentId = async (): Promise<number> => {
    const row = await seeta.selectOne<any>('students', {
      where: { registration_no: 'SH/2026/001' },
    });
    return row.id;
  };

  it('cannot read another school\'s row by guessing its id', async () => {
    const theirId = await seetaStudentId();
    const found = await nabisunsa.selectOne('students', { where: { id: theirId } });
    expect(found).toBeNull();
  });

  it('cannot update another school\'s row', async () => {
    const theirId = await seetaStudentId();
    const affected = await nabisunsa.update('students', { first_name: 'Hacked' }, { id: theirId });
    expect(affected).toBe(0);

    const check = await seeta.selectOne('students', { where: { id: theirId } });
    expect((check as any).first_name).toBe('Brenda');
  });

  it('cannot delete another school\'s row', async () => {
    const theirId = await seetaStudentId();
    expect(await nabisunsa.delete('students', { id: theirId })).toBe(0);
    expect(await seeta.count('students', { id: theirId })).toBe(1);
  });

  it('refuses an attempt to widen scope via where', async () => {
    await expect(
      nabisunsa.select('students', { where: { school_id: seetaId } }),
    ).rejects.toThrow(TenantScopeError);
  });

  it('refuses an attempt to set school_id on insert', async () => {
    await expect(
      nabisunsa.insert('students', {
        school_id: seetaId, registration_no: 'X', first_name: 'A', last_name: 'B',
        class_id: 1, level: 'O-Level',
      } as any),
    ).rejects.toThrow(TenantScopeError);
  });

  it('refuses to reassign school_id on update', async () => {
    await expect(
      nabisunsa.update('students', { school_id: seetaId } as any, { id: 1 }),
    ).rejects.toThrow(TenantScopeError);
  });

  it('refuses an unqualified update or delete', async () => {
    // Without a predicate these would rewrite or wipe every row for the
    // school — never intended, so never allowed.
    await expect(nabisunsa.update('students', { first_name: 'X' }, {})).rejects.toThrow(
      /requires a where clause/,
    );
    await expect(nabisunsa.delete('students', {})).rejects.toThrow(/requires a where clause/);
  });

  it('refuses a table that carries no school_id', async () => {
    await expect(nabisunsa.select('subject_catalog')).rejects.toThrow(TenantScopeError);
    await expect(nabisunsa.select('courses')).rejects.toThrow(TenantScopeError);
  });

  it('rejects injection attempts in identifiers', async () => {
    await expect(
      nabisunsa.select('students', { where: { 'id; DROP TABLE students--': 1 } }),
    ).rejects.toThrow(TenantScopeError);
    await expect(
      nabisunsa.select('students', { orderBy: 'id; DROP TABLE students' }),
    ).rejects.toThrow(TenantScopeError);
    await expect(nabisunsa.select('students; DROP TABLE students')).rejects.toThrow(
      TenantScopeError,
    );
  });

  it('parameterises values, so quotes are data not syntax', async () => {
    const rows = await nabisunsa.select('students', {
      where: { first_name: "' OR 1=1 --" },
    });
    expect(rows).toHaveLength(0);
  });

  it('treats an empty IN list as matching nothing, not everything', async () => {
    const rows = await nabisunsa.select('students', { where: { id: [] } });
    expect(rows).toHaveLength(0);
  });

  it('raw() refuses a query that does not scope by school', async () => {
    await expect(nabisunsa.raw('SELECT * FROM students')).rejects.toThrow(TenantScopeError);
  });

  it('raw() scopes correctly when asked to', async () => {
    const rows = await nabisunsa.raw<any>(
      'SELECT first_name FROM students WHERE school_id = :schoolId ORDER BY id',
    );
    expect(rows.every((r: any) => r.first_name !== 'Brenda')).toBe(true);
  });

  it('raw() interleaves :schoolId and ? placeholders in order', async () => {
    const rows = await nabisunsa.raw<any>(
      'SELECT first_name FROM students WHERE school_id = :schoolId AND level = ?',
      ['O-Level'],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects a nonsensical schoolId at construction', () => {
    expect(() => new TenantDb(0, pool)).toThrow(TenantScopeError);
    expect(() => new TenantDb(-1, pool)).toThrow(TenantScopeError);
    expect(() => new TenantDb(1.5, pool)).toThrow(TenantScopeError);
  });

  it('rolls a transaction back without leaving partial data', async () => {
    const before = await nabisunsa.count('classes');
    await expect(
      nabisunsa.transaction(async (tx) => {
        await tx.insert('classes', { code: 'S5', name: 'Senior Five', level: 'A-Level' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await nabisunsa.count('classes')).toBe(before);
  });

  describe('PlatformDb', () => {
    it('refuses to open a scope for a school that does not exist', async () => {
      await expect(new PlatformDb(pool).forSchool(999999)).rejects.toThrow(/No such school/);
    });

    it('refuses to open a scope for a suspended school', async () => {
      // The system owner can disable a tenant; that must actually stop access.
      await pool.query("UPDATE schools SET status='suspended' WHERE id=?", [seetaId]);
      await expect(new PlatformDb(pool).forSchool(seetaId)).rejects.toThrow(/suspended/);
      await pool.query("UPDATE schools SET status='active' WHERE id=?", [seetaId]);
    });

    it('opens a working scope for an active school', async () => {
      const db = await new PlatformDb(pool).forSchool(nabisunsaId);
      expect(db.schoolId).toBe(nabisunsaId);
      expect(await db.count('students')).toBeGreaterThan(0);
    });
  });
});
