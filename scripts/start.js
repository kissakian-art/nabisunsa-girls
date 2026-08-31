#!/usr/bin/env node
/**
 * Starts the app for one school, on any operating system.
 *
 * `SCHOOL=nabisunsa-girls expo start` is bash. On Windows, cmd and
 * PowerShell both reject it, and the person who hits that is the one running
 * a Windows laptop — which is everyone on this project. So the school is
 * named as an argument instead, and the environment variable still works
 * where it does:
 *
 *   npm start                          the default school
 *   npm start -- --school seeta-high   a different one
 *   npm start -- --web                 anything else is passed to expo
 *
 * There is still no default inside app.config.js. A build must always name
 * its school; this only saves typing during development.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

// --school <slug>, removed from what is forwarded to expo.
let school = process.env.SCHOOL;
const index = args.indexOf('--school');
if (index !== -1) {
  school = args[index + 1];
  args.splice(index, 2);
}

if (!school) {
  const available = fs
    .readdirSync(path.join(__dirname, '..', 'schools'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name);
  school = available[0];
  if (!school) {
    console.error('No schools configured. Copy schools/_template to schools/<slug>.');
    process.exit(1);
  }
  if (available.length > 1) {
    console.log(`\n  Starting ${school}. Others: ${available.slice(1).join(', ')}`);
    console.log(`  Pick one with:  npm start -- --school <slug>\n`);
  }
}

console.log(`\n  School: ${school}\n`);

const child = spawn('npx', ['expo', 'start', ...args], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SCHOOL: school },
});
child.on('exit', (code) => process.exit(code ?? 0));
