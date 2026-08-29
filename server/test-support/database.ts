/**
 * Shared setup for suites that need a real MySQL server.
 *
 * Each suite gets its OWN database, derived from TEST_DATABASE_URL plus a
 * suffix. Jest runs suites in parallel workers, so sharing one database name
 * means two suites drop and recreate it underneath each other — which passes
 * when run alone and fails in the full run.
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const MIGRATIONS = path.join(__dirname, '..', 'db', 'migrations');

/**
 * Every migration, in order.
 *
 * Reading the directory rather than naming 001 keeps the tests honest: a
 * table added in a later migration is part of the schema that ships, so the
 * isolation tests must be run against it too.
 */
const migrationFiles = () =>
  fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();

/**
 * Splits a migration into statements.
 *
 * Line comments are stripped FIRST. The `mysql` client that applies these in
 * production does not care, but a naive split on ";" does: a comment ending
 * in a semicolon — which is ordinary English — would otherwise cut a CREATE
 * TABLE in half and fail here while working in production. That happened.
 */
function statementsIn(file: string): string[] {
  const sql = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--\s.*$/, ''))
    .join('\n');
  return sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
}

export interface TestDatabase {
  pool: mysql.Pool;
  schoolId: number;
  close: () => Promise<void>;
}

/**
 * Creates a fresh database named `<base>_<suffix>`, applies the migration
 * that ships to production, and inserts one active school.
 */
export async function createTestDatabase(
  baseUrl: string,
  suffix: string,
  schoolSlug = 'test-school',
): Promise<TestDatabase> {
  const parsed = new URL(baseUrl);
  const dbName = `${parsed.pathname.replace('/', '')}_${suffix}`;

  const admin = await mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await admin.query(`CREATE DATABASE \`${dbName}\``);
  await admin.end();

  parsed.pathname = `/${dbName}`;
  const pool = mysql.createPool({
    uri: parsed.toString(),
    connectionLimit: 4,
    decimalNumbers: true,
  });

  const conn = await pool.getConnection();
  for (const file of migrationFiles()) {
    for (const statement of statementsIn(path.join(MIGRATIONS, file))) {
      await conn.query(statement);
    }
  }
  const [school] = await conn.query<mysql.ResultSetHeader>(
    'INSERT INTO schools (slug, name, status) VALUES (?, ?, ?)',
    [schoolSlug, 'Test School', 'active'],
  );
  conn.release();

  return {
    pool,
    schoolId: school.insertId,
    close: () => pool.end(),
  };
}
