/**
 * The school this build belongs to.
 *
 * One codebase produces a branded app per school: the badge on Google Play
 * is what makes a parent trust the download, so nothing here can be
 * hard-coded to one school.
 *
 * These values are baked in at build time from `schools/<slug>/school.json`,
 * chosen by `SCHOOL=<slug>` on the build command and carried into the app by
 * `app.config.js`. They are read here rather than from `EXPO_PUBLIC_*`
 * variables because an environment can be left over from the last build —
 * and a school's app published under another school's name is not a mistake
 * with a quiet fix.
 *
 * The login screen needs them before anyone has signed in, which is why they
 * are build-time configuration and not something the server tells us.
 */

import Constants from 'expo-constants';

interface SchoolBrand {
  slug: string;
  name: string;
  shortName: string;
  motto: string;
  contactEmail: string;
  apiBaseUrl: string;
}

const configured = (Constants.expoConfig?.extra?.school ?? {}) as Partial<SchoolBrand>;

/**
 * A missing value here means the build did not go through app.config.js —
 * which is possible only in an odd development setup, never in a release.
 * Falling back to something plausible would hide that; an obvious placeholder
 * makes it visible on the first screen.
 */
function required(field: keyof SchoolBrand, fallback: string): string {
  const value = configured[field];
  if (value) return value;
  if (__DEV__) {
    console.warn(
      `[brand] no ${field} in the build configuration — start the app with ` +
        'SCHOOL=<slug>, for example SCHOOL=nabisunsa-girls npx expo start',
    );
  }
  return fallback;
}

export const Brand = {
  /**
   * The school's identifier on the server. Sent with sign-in and activation:
   * a phone number is unique only within a school, so the server needs to
   * know which school is asking, and a branded app always knows.
   */
  slug: required('slug', 'unconfigured'),
  name: required('name', 'School not configured'),
  shortName: required('shortName', 'School'),
  motto: configured.motto ?? '',
  /** Who a parent should contact when something is wrong. */
  contactEmail: configured.contactEmail ?? '',
  /** Where this school's server lives. Public configuration, not a secret. */
  apiBaseUrl: required('apiBaseUrl', 'http://127.0.0.1:4500').replace(/\/$/, ''),
} as const;
