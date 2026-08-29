/**
 * Reseeds the demo school before a browser suite runs.
 *
 * The suites share one database and change it as they go — the portal suite
 * releases Mathematics, for instance — so a suite that assumes the seeded
 * state must restore it first. Without this they pass or fail depending on
 * the order they were run in, which is worse than failing honestly.
 *
 * Spawned rather than imported because the seed is TypeScript and the suites
 * are plain JavaScript; the env is passed explicitly so this works on
 * Windows as well as Linux.
 */

const { spawnSync } = require('child_process');
const path = require('path');

function reseed() {
  const result = spawnSync(
    'npx',
    ['tsx', 'scripts/seed.ts'],
    {
      cwd: path.join(__dirname, '..', '..'),
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school',
      },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Could not reseed before the suite:\n${result.stderr || result.stdout || 'unknown error'}`,
    );
  }
}

module.exports = { reseed };
