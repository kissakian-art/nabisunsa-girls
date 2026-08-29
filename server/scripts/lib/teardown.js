/**
 * Ordered tenant teardown.
 *
 * A plain `DELETE FROM schools` does NOT work: marksheets.stream_id is
 * RESTRICT, because MySQL forbids CASCADE or SET NULL on a column a stored
 * generated column depends on. The cascade from schools -> streams is
 * therefore blocked while marksheets exist.
 *
 * So removing a tenant is an explicit, ordered operation — which is the right
 * shape anyway, since a real termination exports the data first. This is also
 * what backs the deletion-on-request commitment the proposal makes to schools.
 *
 * Plain CommonJS so the TypeScript seed and the JavaScript smoke tests can
 * share one implementation rather than each keeping their own copy in step.
 */

/** Child tables first, then their parents. */
const ORDERED_DELETES = [
  'DELETE FROM marks WHERE school_id = ?',
  'DELETE FROM term_results WHERE school_id = ?',
  'DELETE FROM marksheets WHERE school_id = ?',
  'DELETE FROM student_invites WHERE school_id = ?',
  'DELETE FROM student_uce_grades WHERE student_id IN (SELECT id FROM students WHERE school_id = ?)',
  'DELETE FROM student_subjects WHERE student_id IN (SELECT id FROM students WHERE school_id = ?)',
  'DELETE FROM students WHERE school_id = ?',
  'DELETE FROM teacher_allocations WHERE school_id = ?',
  'DELETE FROM combination_requirements WHERE combination_id IN (SELECT id FROM combinations WHERE school_id = ?)',
  'DELETE FROM combination_subjects WHERE combination_id IN (SELECT id FROM combinations WHERE school_id = ?)',
  'DELETE FROM combinations WHERE school_id = ?',
  'DELETE FROM streams WHERE school_id = ?',
  // schools.current_term_id points at terms, so release it before terms go.
  'UPDATE schools SET current_term_id = NULL WHERE id = ?',
  'DELETE FROM schools WHERE id = ?',
];

/** Deletes a school and everything belonging to it. */
async function deleteSchool(conn, schoolId) {
  for (const sql of ORDERED_DELETES) {
    await conn.query(sql, [schoolId]);
  }
}

/** Deletes a school by slug, if it exists. Returns whether anything went. */
async function deleteSchoolBySlug(conn, slug) {
  const [rows] = await conn.query('SELECT id FROM schools WHERE slug = ?', [slug]);
  if (!rows[0]) return false;
  await deleteSchool(conn, rows[0].id);
  return true;
}

module.exports = { deleteSchool, deleteSchoolBySlug, ORDERED_DELETES };
