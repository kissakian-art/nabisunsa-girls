#!/usr/bin/env node
/**
 * Creates a school and its first administrator.
 *
 * Without this a freshly deployed portal has an empty database: nobody can
 * sign in, and /setup — where classes, subjects and class lists are created
 * — needs a session. This is the one step that cannot be done through the
 * interface, because it is what creates the first way in.
 *
 * Plain JavaScript on purpose. It runs on the server, where the container
 * has no TypeScript toolchain, so it must work with nothing but node and
 * the mysql2 module the app already ships.
 *
 *   node scripts/bootstrap-school.js \
 *     --slug seeta-high --name "Seeta High School" \
 *     --admin head@seeta.ac.ug --password '...'
 *
 * Safe to re-run: an existing slug is left alone, and an existing email is
 * never given a new password (that would be a silent takeover of a live
 * account).
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

const GRADING_SCALE = [
  ['A', 80, 'Distinction'],
  ['B', 70, 'Credit'],
  ['C', 60, 'Credit'],
  ['D', 50, 'Pass'],
  ['E', 40, 'Pass'],
  ['O', 30, 'Subsidiary'],
  ['F', 0, 'Failure'],
];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const slug = arg('slug');
  const name = arg('name');
  const email = (arg('admin') || '').trim().toLowerCase();
  const password = arg('password') || process.env.ADMIN_PASSWORD;

  if (!slug || !name || !email || !password) {
    console.error(
      'Usage: node scripts/bootstrap-school.js --slug <slug> --name "<School Name>" ' +
        '--admin <email> --password <password>',
    );
    process.exit(2);
  }
  if (password.length < 12) {
    // This account can release marks to every parent at the school.
    console.error('Choose an administrator password of at least 12 characters.');
    process.exit(2);
  }

  const db = await mysql.createConnection({ uri: url });

  const [existing] = await db.query('SELECT id FROM schools WHERE slug = ?', [slug]);
  let schoolId = existing[0]?.id;

  if (schoolId) {
    console.log(`School "${slug}" already exists (id ${schoolId}) — left as it is.`);
  } else {
    const [created] = await db.query(
      `INSERT INTO schools (slug, name, short_name, status)
       VALUES (?, ?, ?, 'trial')`,
      [slug, name, arg('short', name.split(' ')[0])],
    );
    schoolId = created.insertId;
    console.log(`Created school "${name}" (id ${schoolId}, on trial).`);

    // A school cannot compute a single mark without these, and every school
    // starts from the same Ugandan defaults before editing them.
    await db.query(
      'INSERT INTO school_grading_config (school_id, ca_weight, eot_weight, ca_best_of) VALUES (?, 20, 80, 3)',
      [schoolId],
    );
    for (const [index, [grade, min, label]] of GRADING_SCALE.entries()) {
      await db.query(
        'INSERT INTO grading_scale (school_id, grade, min_score, label, points, sort_order) VALUES (?,?,?,?,?,?)',
        [schoolId, grade, min, label, index + 1, index],
      );
    }
    console.log('Added the default 20/80 weighting and grading scale.');
  }

  const [user] = await db.query('SELECT id, school_id FROM users WHERE email = ?', [email]);
  if (user[0]) {
    // Never reset a live account's password from a deploy script: that is
    // how an administrator quietly loses control of their own school.
    console.log(`User ${email} already exists — password unchanged.`);
  } else {
    await db.query(
      `INSERT INTO users (school_id, role, display_name, email, password_hash)
       VALUES (?, 'school_admin', ?, ?, ?)`,
      [schoolId, arg('display', 'Head Teacher'), email, await bcrypt.hash(password, 10)],
    );
    console.log(`Created administrator ${email}.`);
  }

  await db.end();

  console.log(`
Next: sign in at the portal as ${email}, then work through Setup —
classes, subjects, class lists, marksheets. No SQL from here on.
`);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
