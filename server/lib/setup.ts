/**
 * School setup: the things a school must have before any marks can be
 * entered — classes, streams, subjects, terms, assessments and students.
 *
 * Until these exist in the interface, onboarding a school means running SQL
 * by hand, which means no school can start without Midway present. That is
 * the constraint this file removes.
 */

import type { RowDataPacket } from 'mysql2';
import { PlatformDb, type TenantDb } from '../db/tenant';

export class SetupError extends Error {}

// ---------------------------------------------------------------------
// Classes and streams
// ---------------------------------------------------------------------

export interface ClassRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  level: 'O-Level' | 'A-Level';
  sort_order: number;
  streamNames: string | null;
  studentCount: number;
}

export async function listClasses(db: TenantDb): Promise<ClassRow[]> {
  return db.raw<ClassRow>(
    `SELECT c.id, c.code, c.name, c.level, c.sort_order,
            GROUP_CONCAT(DISTINCT st.name ORDER BY st.name SEPARATOR ', ') AS streamNames,
            (SELECT COUNT(*) FROM students s
              WHERE s.class_id = c.id AND s.status = 'active') AS studentCount
       FROM classes c
       LEFT JOIN streams st ON st.class_id = c.id
      WHERE c.school_id = :schoolId
      GROUP BY c.id
      ORDER BY c.sort_order, c.code`,
  );
}

export async function addClass(
  db: TenantDb,
  input: { code: string; name: string; level: 'O-Level' | 'A-Level' },
): Promise<number> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new SetupError('A class code is required');

  const existing = await db.selectOne('classes', { where: { code } });
  if (existing) throw new SetupError(`Class ${code} already exists`);

  // S1..S6 sort naturally by their digit; anything else goes to the end.
  const digit = Number(code.replace(/\D/g, ''));
  return db.insert('classes', {
    code,
    name: input.name.trim() || code,
    level: input.level,
    sort_order: Number.isFinite(digit) ? digit : 99,
  });
}

export async function addStream(
  db: TenantDb,
  classId: number,
  name: string,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new SetupError('A stream name is required');

  const cls = await db.selectOne('classes', { where: { id: classId } });
  if (!cls) throw new SetupError('No such class');

  const existing = await db.selectOne('streams', {
    where: { class_id: classId, name: trimmed },
  });
  if (existing) throw new SetupError(`That class already has a stream called ${trimmed}`);

  return db.insert('streams', { class_id: classId, name: trimmed });
}

// ---------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------

export interface SubjectRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  level: string;
  category: string | null;
  is_active: number;
}

export async function listSubjects(db: TenantDb): Promise<SubjectRow[]> {
  return db.select<SubjectRow>('subjects', { orderBy: 'name ASC' });
}

export interface CatalogRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  level: string;
  category: string | null;
}

/** National subjects this school has not adopted yet. */
export async function availableCatalogSubjects(db: TenantDb): Promise<CatalogRow[]> {
  return db.raw<CatalogRow>(
    `SELECT sc.id, sc.code, sc.name, sc.level, sc.category
       FROM subject_catalog sc
      WHERE NOT EXISTS (
        SELECT 1 FROM subjects s
         WHERE s.school_id = :schoolId AND s.catalog_id = sc.id
      )
      ORDER BY sc.name`,
  );
}

/**
 * Adopts national subjects into this school.
 *
 * Skips anything whose code the school already uses, so adopting twice is
 * harmless rather than an error the user has to understand.
 */
export async function adoptCatalogSubjects(
  db: TenantDb,
  catalogIds: number[],
): Promise<number> {
  if (catalogIds.length === 0) return 0;

  // The catalogue is shared reference data, not this school's. Reading it
  // through PlatformDb is the honest call; forcing it through the tenant
  // handle would mean smuggling a meaningless school_id into the query.
  const rows = await new PlatformDb().query<CatalogRow>(
    `SELECT id, code, name, level, category
       FROM subject_catalog
      WHERE id IN (${catalogIds.map(() => '?').join(',')})`,
    catalogIds,
  );

  const existing = await listSubjects(db);
  const taken = new Set(existing.map((s) => s.code));

  let added = 0;
  for (const row of rows) {
    if (taken.has(row.code)) continue;
    await db.insert('subjects', {
      catalog_id: row.id,
      code: row.code,
      name: row.name,
      level: row.level,
      category: row.category,
    });
    added += 1;
  }
  return added;
}

// ---------------------------------------------------------------------
// Students — bulk entry, because nobody types 900 of them one at a time
// ---------------------------------------------------------------------

export interface ParsedStudent {
  registrationNo: string;
  firstName: string;
  lastName: string;
  line: number;
}

export interface ParseResult {
  students: ParsedStudent[];
  errors: { line: number; text: string; problem: string }[];
}

/**
 * Parses a pasted class list.
 *
 * Accepts comma or tab separated `registration, last name, first name`,
 * which is what comes out of a spreadsheet. Blank lines are skipped, and a
 * bad line is reported with its number rather than failing the whole paste —
 * an office pasting 200 rows should not lose all of them to one typo.
 */
export function parseStudentList(text: string): ParseResult {
  const students: ParsedStudent[] = [];
  const errors: ParseResult['errors'] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/\t|,/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) {
      errors.push({
        line, text: trimmed,
        problem: 'Expected registration number, last name, first name',
      });
      return;
    }

    const [registrationNo, lastName, firstName] = parts;
    if (seen.has(registrationNo.toLowerCase())) {
      errors.push({ line, text: trimmed, problem: `Duplicate registration number ${registrationNo}` });
      return;
    }
    seen.add(registrationNo.toLowerCase());

    students.push({ registrationNo, lastName, firstName, line });
  });

  return { students, errors };
}

export interface ImportOutcome {
  added: number;
  skipped: { registrationNo: string; reason: string }[];
}

/**
 * Imports a parsed class list.
 *
 * A registration number already on the roll is skipped rather than
 * overwritten: re-pasting a list that gained three new girls must add three
 * students, not silently rewrite the other 200.
 */
export async function importStudents(
  db: TenantDb,
  classId: number,
  streamId: number | null,
  students: ParsedStudent[],
): Promise<ImportOutcome> {
  const cls = await db.selectOne<RowDataPacket & { level: 'O-Level' | 'A-Level' }>(
    'classes', { where: { id: classId } },
  );
  if (!cls) throw new SetupError('No such class');

  if (streamId != null) {
    const stream = await db.selectOne('streams', {
      where: { id: streamId, class_id: classId },
    });
    if (!stream) throw new SetupError('That stream does not belong to that class');
  }

  const outcome: ImportOutcome = { added: 0, skipped: [] };

  for (const student of students) {
    const existing = await db.selectOne('students', {
      where: { registration_no: student.registrationNo },
    });
    if (existing) {
      outcome.skipped.push({
        registrationNo: student.registrationNo,
        reason: 'already on the roll',
      });
      continue;
    }
    await db.insert('students', {
      registration_no: student.registrationNo,
      first_name: student.firstName,
      last_name: student.lastName,
      class_id: classId,
      stream_id: streamId,
      level: cls.level,
    });
    outcome.added += 1;
  }

  return outcome;
}

// ---------------------------------------------------------------------
// Marksheets for a term
// ---------------------------------------------------------------------

export interface GenerateOutcome {
  created: number;
  existing: number;
}

/**
 * Creates the marksheets a term needs: one per class, stream, subject and
 * assessment.
 *
 * Generating them is the whole point — a school with 6 classes, 3 streams,
 * 12 subjects and 4 assessments needs 864 sheets, and nobody is creating
 * those by hand. Existing sheets are counted, never touched, so running this
 * again after adding a subject only fills the gaps.
 */
export async function generateMarksheets(
  db: TenantDb,
  termId: number,
): Promise<GenerateOutcome> {
  const term = await db.selectOne('terms', { where: { id: termId } });
  if (!term) throw new SetupError('No such term');

  const combinations = await db.raw<RowDataPacket & {
    classId: number; streamId: number | null; subjectId: number; assessmentId: number;
  }>(
    `SELECT c.id AS classId, st.id AS streamId, s.id AS subjectId, a.id AS assessmentId
       FROM classes c
       LEFT JOIN streams st ON st.class_id = c.id
       JOIN subjects s ON s.school_id = c.school_id AND s.is_active = 1
       JOIN assessments a ON a.school_id = c.school_id
      WHERE c.school_id = :schoolId
        -- Only classes that actually have students: generating sheets for an
        -- empty class buries the real work in noise.
        AND EXISTS (
          SELECT 1 FROM students stu
           WHERE stu.class_id = c.id AND stu.status = 'active'
             AND (st.id IS NULL OR stu.stream_id = st.id)
        )`,
  );

  const outcome: GenerateOutcome = { created: 0, existing: 0 };

  for (const combo of combinations) {
    const existing = await db.selectOne('marksheets', {
      where: {
        term_id: termId,
        class_id: combo.classId,
        stream_id: combo.streamId,
        subject_id: combo.subjectId,
        assessment_id: combo.assessmentId,
      },
    });
    if (existing) {
      outcome.existing += 1;
      continue;
    }
    await db.insert('marksheets', {
      term_id: termId,
      class_id: combo.classId,
      stream_id: combo.streamId,
      subject_id: combo.subjectId,
      assessment_id: combo.assessmentId,
      status: 'draft',
    });
    outcome.created += 1;
  }

  return outcome;
}

// ---------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------

export interface Readiness {
  classes: number;
  subjects: number;
  students: number;
  terms: number;
  assessments: number;
  hasFinalExam: boolean;
  hasGrading: boolean;
  ready: boolean;
  missing: string[];
}

/**
 * What a school still needs before marks can be entered.
 *
 * Shown on the setup page so onboarding is a checklist rather than a guess.
 */
export async function checkReadiness(db: TenantDb): Promise<Readiness> {
  const [classes, subjects, students, terms, assessments] = await Promise.all([
    db.count('classes'),
    db.count('subjects'),
    db.count('students'),
    db.count('terms'),
    db.count('assessments'),
  ]);
  const finalExam = await db.count('assessments', { is_final: 1 });
  const grading = await db.selectOne('school_grading_config');
  const scale = await db.count('grading_scale');

  const missing: string[] = [];
  if (classes === 0) missing.push('Add the classes the school teaches');
  if (subjects === 0) missing.push('Adopt the subjects the school offers');
  if (students === 0) missing.push('Import the class lists');
  if (terms === 0) missing.push('Create the current term');
  if (assessments === 0) missing.push('Set up the assessments, such as coursework and end of term');
  else if (finalExam === 0) {
    missing.push('Mark which assessment is the end-of-term exam that carries the final weight');
  }
  if (!grading || scale === 0) missing.push('Set the grading scale and weighting');

  return {
    classes, subjects, students, terms, assessments,
    hasFinalExam: finalExam > 0,
    hasGrading: !!grading && scale > 0,
    ready: missing.length === 0,
    missing,
  };
}
