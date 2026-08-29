/**
 * The school this build belongs to.
 *
 * One codebase produces a branded app per school: the badge on Google Play
 * is what makes a parent trust the download, so the name, motto and contact
 * details cannot be hard-coded to one school any more.
 *
 * These are build-time values, set in the school's `.env` before the APK is
 * produced, because the login screen has to be branded BEFORE anyone signs
 * in — there is no session yet to read a name from. Once signed in, the
 * server's own record (`/api/me`) is the better source and takes over.
 */

const env = process.env;

export const Brand = {
  name: env.EXPO_PUBLIC_SCHOOL_NAME || "Nabisunsa Girls' Secondary School",
  shortName: env.EXPO_PUBLIC_SCHOOL_SHORT_NAME || 'Nabisunsa',
  motto: env.EXPO_PUBLIC_SCHOOL_MOTTO || 'Empowerment Through Education',
  /** Who a parent should call when something is wrong. */
  contactEmail: env.EXPO_PUBLIC_SCHOOL_CONTACT_EMAIL || 'admin@nabisunsagirls.ac.ug',
} as const;
