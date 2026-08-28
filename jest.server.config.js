/**
 * Server-side tests run separately from the Expo app's: they are plain Node
 * with no React Native transform, and the tenant suite needs a real MySQL.
 *
 *   npm run test:server
 *   TEST_DATABASE_URL='mysql://root@127.0.0.1:3306/midway_test' npm run test:server
 *
 * Without TEST_DATABASE_URL the tenant isolation suite skips rather than
 * fails, so the domain tests stay runnable anywhere.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.server.json' }],
  },
};
