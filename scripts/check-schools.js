#!/usr/bin/env node
/**
 * Validates every school folder, and the invariants that hold *between*
 * them.
 *
 * app.config.js already refuses a bad build, but it only ever sees the one
 * school being built. Two schools sharing an Android package name, or two
 * pointing at slugs that collide, are mistakes no single build can see — and
 * the second of them cannot be published at all, discovered at the Play
 * Console rather than here.
 *
 *   npm run schools:check
 */

const fs = require('fs');
const path = require('path');

const SCHOOLS = path.join(__dirname, '..', 'schools');
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

let problems = 0;
const problem = (where, message) => {
  console.log(`  PROBLEM  ${where}: ${message}`);
  problems += 1;
};
const note = (where, message) => console.log(`  note     ${where}: ${message}`);

const folders = fs
  .readdirSync(SCHOOLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);

if (folders.length === 0) {
  console.log('No schools configured.');
  process.exit(0);
}

console.log(`\n${folders.length} school(s) configured\n`);

const packages = new Map();
const slugs = new Map();

for (const folder of folders) {
  const dir = path.join(SCHOOLS, folder);
  const file = path.join(dir, 'school.json');

  if (!fs.existsSync(file)) {
    problem(folder, 'no school.json');
    continue;
  }

  let school;
  try {
    school = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problem(folder, `school.json is not valid JSON — ${error.message}`);
    continue;
  }

  console.log(`${school.name || folder}`);

  for (const field of ['slug', 'name', 'shortName', 'apiBaseUrl', 'androidPackage']) {
    if (!school[field]) problem(folder, `missing "${field}"`);
  }
  if (school.slug && school.slug !== folder) {
    problem(folder, `school.json says slug "${school.slug}"`);
  }
  if (school.androidPackage && !PACKAGE_PATTERN.test(school.androidPackage)) {
    problem(folder, `"${school.androidPackage}" is not a valid Android package name`);
  }
  if (school.apiBaseUrl && !/^https:\/\//.test(school.apiBaseUrl)) {
    problem(folder, `apiBaseUrl "${school.apiBaseUrl}" is not https`);
  }

  // Unique across the platform, not just valid. Google Play identifies an
  // app by its package name; a duplicate cannot be published at all.
  if (school.androidPackage) {
    const already = packages.get(school.androidPackage);
    if (already) problem(folder, `shares its Android package with ${already}`);
    else packages.set(school.androidPackage, folder);
  }
  if (school.slug) {
    const already = slugs.get(school.slug);
    if (already) problem(folder, `shares its slug with ${already}`);
    else slugs.set(school.slug, folder);
  }

  // Not problems: an app builds and runs without any of these. They are the
  // difference between a test build and one a school would put its name on.
  if (!fs.existsSync(path.join(dir, 'icon.png'))) {
    note(folder, 'no icon.png — will ship with the Midway default icon');
  }
  if (!fs.existsSync(path.join(dir, 'google-services.json'))) {
    note(folder, 'no google-services.json — Android notifications will not arrive');
  }
  if (!school.easProjectId) {
    note(folder, 'no easProjectId — set it after creating the EAS project');
  }
  console.log('');
}

console.log(
  problems === 0
    ? 'Every school is buildable.'
    : `${problems} problem(s) — these stop a build, or stop a publish.`,
);
process.exit(problems === 0 ? 0 : 1);
