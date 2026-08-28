/**
 * Tenant-scoped database access.
 *
 * WHY THIS EXISTS
 * ---------------
 * MySQL has no row-level security, so nothing in the database stops a query
 * that forgets `school_id` from returning another school's rows. In a
 * multi-tenant school platform that is the one bug that ends the business:
 * one parent seeing another school's marks is not a bug report, it is a
 * breach.
 *
 * So tenant scoping is not left to the caller's discipline. A caller holds a
 * `TenantDb`, which is bound to exactly one school and injects the school_id
 * predicate itself. There is no method on it that runs an unscoped query.
 *
 * Cross-tenant work (the Midway platform console, the shared course
 * catalogue) has to reach for `PlatformDb` explicitly, which makes it
 * visible in review rather than accidental.
 *
 * WHY NOT PRISMA, when the other Midway apps use it
 * -------------------------------------------------
 * Two reasons, both specific to this app:
 *
 *  1. Prisma makes omitting `where: { schoolId }` a silent, valid query. The
 *     failure mode is exactly the one we cannot afford, and a linter cannot
 *     reliably catch it.
 *  2. DEPLOYMENT_HANDOFF §3 records `prisma migrate deploy` breaking on
 *     MySQL 8.0 with MariaDB-authored migrations, forcing a `db push` and a
 *     baseline. Here `server/db/migrations/*.sql` is the single source of
 *     truth, applied with plain SQL, and it encodes CHECK constraints and
 *     generated columns Prisma cannot fully express anyway.
 *
 * Prisma can still be introspected onto this schema later for read models if
 * that turns out to be useful; it just does not own the schema or the
 * tenant boundary.
 */

import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class TenantScopeError extends Error {}

let pool: Pool | null = null;

export function getPool(options?: PoolOptions): Pool {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url && !options) {
    throw new Error('DATABASE_URL is not set');
  }

  pool = mysql.createPool(
    options ?? {
      uri: url,
      connectionLimit: Number(process.env.DB_POOL_SIZE ?? 8),
      charset: 'utf8mb4',
      timezone: 'Z',
      // Keep DECIMAL and BIGINT out of float territory: marks and ids must
      // survive a round trip exactly.
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
    },
  );
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Tables that carry a school_id and may therefore be tenant-scoped. */
export const TENANT_TABLES = [
  'school_grading_config',
  'grading_scale',
  'terms',
  'classes',
  'streams',
  'subjects',
  'combinations',
  'users',
  'students',
  'teacher_allocations',
  'assessments',
  'marksheets',
  'marks',
  'term_results',
  'announcements',
  'push_devices',
  'notifications',
  // school_id is nullable here for platform-level entries, but a school's
  // own audit trail is written and read tenant-scoped.
  'audit_log',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name: string, kind: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new TenantScopeError(`Unsafe ${kind}: ${JSON.stringify(name)}`);
  }
}

export interface QueryOptions {
  /** Column/value pairs, ANDed together. Values are always parameterised. */
  where?: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
  offset?: number;
  columns?: string[];
}

/**
 * A handle bound to one school. Every read and write it performs carries
 * that school's id, added here rather than by the caller.
 */
export class TenantDb {
  constructor(
    readonly schoolId: number,
    private readonly db: Pool = getPool(),
  ) {
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      throw new TenantScopeError(`Invalid schoolId: ${schoolId}`);
    }
  }

  private assertTenantTable(table: string): asserts table is TenantTable {
    if (!(TENANT_TABLES as readonly string[]).includes(table)) {
      throw new TenantScopeError(
        `'${table}' is not a tenant-scoped table. Use PlatformDb for shared or cross-school data.`,
      );
    }
  }

  private buildWhere(where: Record<string, unknown> = {}): {
    clause: string;
    params: unknown[];
  } {
    // school_id comes first and is not overridable: a caller passing their
    // own school_id in `where` cannot widen the scope.
    const parts = ['`school_id` = ?'];
    const params: unknown[] = [this.schoolId];

    for (const [column, value] of Object.entries(where)) {
      assertIdentifier(column, 'column name');
      if (column === 'school_id') {
        throw new TenantScopeError('school_id is set by the tenant scope and cannot be overridden');
      }
      if (value === null) {
        parts.push(`\`${column}\` IS NULL`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          // An empty IN () is a syntax error in MySQL, and semantically
          // matches nothing — say so explicitly.
          parts.push('1 = 0');
        } else {
          parts.push(`\`${column}\` IN (${value.map(() => '?').join(', ')})`);
          params.push(...value);
        }
      } else {
        parts.push(`\`${column}\` = ?`);
        params.push(value);
      }
    }

    return { clause: parts.join(' AND '), params };
  }

  async select<T extends RowDataPacket>(
    table: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    this.assertTenantTable(table);

    let columns = '*';
    if (options.columns?.length) {
      options.columns.forEach((c) => assertIdentifier(c, 'column name'));
      columns = options.columns.map((c) => `\`${c}\``).join(', ');
    }

    const { clause, params } = this.buildWhere(options.where);
    let sql = `SELECT ${columns} FROM \`${table}\` WHERE ${clause}`;

    if (options.orderBy) {
      // Only `col`, `col ASC`, `col DESC`, comma-separated.
      const ordered = options.orderBy.split(',').map((part) => {
        const [col, dir = 'ASC'] = part.trim().split(/\s+/);
        assertIdentifier(col, 'order column');
        const direction = dir.toUpperCase();
        if (direction !== 'ASC' && direction !== 'DESC') {
          throw new TenantScopeError(`Unsafe sort direction: ${dir}`);
        }
        return `\`${col}\` ${direction}`;
      });
      sql += ` ORDER BY ${ordered.join(', ')}`;
    }

    if (options.limit != null) {
      if (!Number.isInteger(options.limit) || options.limit < 0) {
        throw new TenantScopeError(`Invalid limit: ${options.limit}`);
      }
      sql += ` LIMIT ${options.limit}`;
      if (options.offset != null) {
        if (!Number.isInteger(options.offset) || options.offset < 0) {
          throw new TenantScopeError(`Invalid offset: ${options.offset}`);
        }
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const [rows] = await this.db.query<T[]>(sql, params);
    return rows;
  }

  async selectOne<T extends RowDataPacket>(
    table: string,
    options: QueryOptions = {},
  ): Promise<T | null> {
    const rows = await this.select<T>(table, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async count(table: string, where: Record<string, unknown> = {}): Promise<number> {
    this.assertTenantTable(table);
    const { clause, params } = this.buildWhere(where);
    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${clause}`,
      params,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async insert(table: string, values: Record<string, unknown>): Promise<number> {
    this.assertTenantTable(table);
    if ('school_id' in values) {
      throw new TenantScopeError('school_id is set by the tenant scope and must not be passed');
    }

    const columns = Object.keys(values);
    columns.forEach((c) => assertIdentifier(c, 'column name'));

    const allColumns = ['school_id', ...columns];
    const params = [this.schoolId, ...Object.values(values)];

    const [result] = await this.db.query<ResultSetHeader>(
      `INSERT INTO \`${table}\` (${allColumns.map((c) => `\`${c}\``).join(', ')})
       VALUES (${allColumns.map(() => '?').join(', ')})`,
      params,
    );
    return result.insertId;
  }

  async update(
    table: string,
    values: Record<string, unknown>,
    where: Record<string, unknown>,
  ): Promise<number> {
    this.assertTenantTable(table);
    if ('school_id' in values) {
      throw new TenantScopeError('school_id must not be reassigned');
    }
    if (Object.keys(values).length === 0) {
      throw new TenantScopeError('update called with no values');
    }
    // An unconstrained UPDATE would rewrite every row for this school. That
    // is never intended, so require a predicate.
    if (Object.keys(where).length === 0) {
      throw new TenantScopeError('update requires a where clause');
    }

    const columns = Object.keys(values);
    columns.forEach((c) => assertIdentifier(c, 'column name'));

    const { clause, params: whereParams } = this.buildWhere(where);
    const [result] = await this.db.query<ResultSetHeader>(
      `UPDATE \`${table}\` SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE ${clause}`,
      [...Object.values(values), ...whereParams],
    );
    return result.affectedRows;
  }

  async delete(table: string, where: Record<string, unknown>): Promise<number> {
    this.assertTenantTable(table);
    if (Object.keys(where).length === 0) {
      throw new TenantScopeError('delete requires a where clause');
    }
    const { clause, params } = this.buildWhere(where);
    const [result] = await this.db.query<ResultSetHeader>(
      `DELETE FROM \`${table}\` WHERE ${clause}`,
      params,
    );
    return result.affectedRows;
  }

  /**
   * Escape hatch for reads too complex for `select` — joins, aggregates,
   * rankings.
   *
   * The SQL must mention school_id and the caller must pass the scope via
   * `:schoolId`, which is substituted here. This cannot prove the predicate
   * is applied correctly, but it does make an unscoped query fail loudly
   * instead of silently returning the whole platform's data.
   */
  async raw<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!/:schoolId\b/.test(sql)) {
      throw new TenantScopeError(
        'raw() requires the query to reference :schoolId — an unscoped query would cross tenants',
      );
    }
    const finalParams: unknown[] = [];
    let index = 0;
    const prepared = sql.replace(/:schoolId\b|\?/g, (match) => {
      if (match === '?') {
        finalParams.push(params[index++]);
      } else {
        finalParams.push(this.schoolId);
      }
      return '?';
    });
    const [rows] = await this.db.query<T[]>(prepared, finalParams);
    return rows;
  }

  /** Runs `fn` inside a transaction, scoped to the same school. */
  async transaction<T>(fn: (tx: TenantDb) => Promise<T>): Promise<T> {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const scoped = new TenantDb(this.schoolId, conn as unknown as Pool);
      const result = await fn(scoped);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

/**
 * Cross-tenant access, for the shared curriculum catalogue and the Midway
 * platform console. Deliberately separate and deliberately awkward: reaching
 * for this should be a visible decision.
 */
export class PlatformDb {
  constructor(private readonly db: Pool = getPool()) {}

  async query<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.db.query<T[]>(sql, params);
    return rows;
  }

  /** Opens a tenant-scoped handle, after confirming the school exists. */
  async forSchool(schoolId: number): Promise<TenantDb> {
    const [rows] = await this.db.query<RowDataPacket[]>(
      'SELECT id, status FROM schools WHERE id = ?',
      [schoolId],
    );
    const school = rows[0];
    if (!school) throw new TenantScopeError(`No such school: ${schoolId}`);
    if (school.status === 'suspended' || school.status === 'closed') {
      throw new TenantScopeError(`School ${schoolId} is ${school.status}`);
    }
    return new TenantDb(schoolId, this.db);
  }
}
