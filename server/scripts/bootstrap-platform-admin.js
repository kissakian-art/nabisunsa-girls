#!/usr/bin/env node
/**
 * Creates a Midway platform administrator — the console's first way in.
 *
 * This is now the only step a fresh deployment cannot do through a browser.
 * Everything else follows from it: the platform administrator signs in at
 * /platform and creates schools and their administrators there, so onboarding
 * a school no longer needs SSH, a shell, or anyone writing SQL.
 *
 *   node scripts/bootstrap-platform-admin.js \
 *     --email you@midwayug.com --name "Your Name" --password '...'
 *
 * The password may also come from ADMIN_PASSWORD in the environment, which
 * keeps it out of the container's process list and the shell history.
 *
 * Plain JavaScript on purpose: it runs inside the running container, which
 * has no TypeScript toolchain — only node and the two modules the image
 * installs for exactly this (see the `adminmods` stage in the Dockerfile).
 *
 * Safe to re-run. An existing email is never given a new password: a deploy
 * script that could silently reset a live platform account would be a way in
 * for anyone who could run a deploy.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

/** Kept in step with MIN_ADMIN_PASSWORD in domain/platform.ts. */
const MIN_PASSWORD = 12;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const email = (arg('email') || '').trim().toLowerCase();
  const name = arg('name') || email;
  const password = arg('password') || process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      'Usage: node scripts/bootstrap-platform-admin.js --email <email> ' +
        '[--name "<Name>"] --password <password>',
    );
    console.error('       (or set ADMIN_PASSWORD in the environment)');
    process.exit(2);
  }
  if (!email.includes('@')) {
    console.error('That does not look like an email address.');
    process.exit(2);
  }
  if (password.length < MIN_PASSWORD) {
    // This account can suspend every school on the platform.
    console.error(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    process.exit(2);
  }

  const db = await mysql.createConnection({ uri: url });

  const [existing] = await db.query('SELECT id, is_active FROM platform_users WHERE email = ?', [
    email,
  ]);

  if (existing[0]) {
    console.log(`${email} is already a platform administrator — password unchanged.`);
    if (!existing[0].is_active) {
      // Reactivating is not a takeover: it restores an account whose password
      // its owner still knows, and there is no other way back in if the last
      // administrator was deactivated.
      await db.query('UPDATE platform_users SET is_active = 1 WHERE id = ?', [existing[0].id]);
      console.log('It was deactivated, and has been reactivated.');
    }
  } else {
    await db.query(
      `INSERT INTO platform_users (display_name, email, password_hash)
       VALUES (?, ?, ?)`,
      [name, email, await bcrypt.hash(password, 10)],
    );
    console.log(`Created platform administrator ${email}.`);
  }

  const [count] = await db.query('SELECT COUNT(*) AS n FROM platform_users WHERE is_active = 1');
  await db.end();

  console.log(`
${count[0].n} active platform administrator(s).

Next: sign in at /platform — not the school portal, which this account
cannot use — and add schools there. Each school gets its own administrator,
and Midway never needs a shell on this server again.
`);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
