/**
 * One codebase, one branded app per school.
 *
 * The build names the school and everything else follows from
 * `schools/<slug>/school.json`:
 *
 *   SCHOOL=nabisunsa-girls npx eas build --platform android
 *
 * WHY THIS REFUSES TO GUESS
 * -------------------------
 * The branding used to come from EXPO_PUBLIC_* variables in a .env file.
 * That works until the day Seeta's app is built with Nabisunsa's .env still
 * in place and published to Google Play under Seeta's name — a mistake with
 * no quiet fix, because by then it is on parents' phones. So there is no
 * default school and no fallback: an unnamed or unknown SCHOOL stops the
 * build here, where it costs nothing.
 *
 * Everything the app reads at runtime comes from `extra.school` below rather
 * than from the environment, so there is one source of truth and it is the
 * file that was named on the command line.
 */

const fs = require('fs');
const path = require('path');

const SCHOOLS = path.join(__dirname, 'schools');

const fail = (message) => {
  throw new Error(`\n\nBranded build refused:\n  ${message}\n`);
};

/** Reverse-DNS, lower case, at least two segments. Play requires it, and it can never change. */
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function loadSchool() {
  const slug = (process.env.SCHOOL || '').trim();

  if (!slug) {
    const available = fs
      .readdirSync(SCHOOLS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name);
    fail(
      'SCHOOL is not set, and there is deliberately no default — a build ' +
        'that guesses is how one school\'s app reaches Google Play under ' +
        `another's name.\n  Available: ${available.join(', ') || 'none'}\n` +
        '  For example:  SCHOOL=nabisunsa-girls npx expo start',
    );
  }

  // Underscore-prefixed folders are templates, not schools. Building
  // "_template" would produce an app called "Short Name".
  if (slug.startsWith('_')) {
    fail(`"${slug}" is a template, not a school. Copy it to a real slug first.`);
  }

  const dir = path.join(SCHOOLS, slug);
  const file = path.join(dir, 'school.json');
  if (!fs.existsSync(file)) {
    fail(`No schools/${slug}/school.json. Copy schools/_template and fill it in.`);
  }

  let school;
  try {
    school = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`schools/${slug}/school.json is not valid JSON: ${error.message}`);
  }

  for (const field of ['slug', 'name', 'shortName', 'apiBaseUrl', 'androidPackage']) {
    if (!school[field]) fail(`schools/${slug}/school.json has no "${field}".`);
  }

  // The slug is sent with every sign-in and is compiled into the app. A
  // folder and a file that disagree means one of them is a typo, and the
  // wrong one reaches the server.
  if (school.slug !== slug) {
    fail(`schools/${slug}/school.json says slug "${school.slug}". They must match.`);
  }

  if (!PACKAGE_PATTERN.test(school.androidPackage)) {
    fail(
      `"${school.androidPackage}" is not a valid Android package name. ` +
        'Use reverse DNS, for example ug.midway.school.nabisunsagirls.',
    );
  }

  // Pointing a development build at a server on this machine, without
  // editing — and therefore risking committing — the school's real address.
  //
  // It cannot reach a release: an EAS build refuses it outright. That
  // matters more than the convenience, because an app shipped pointing at
  // 127.0.0.1 works perfectly on the machine that built it and on no
  // parent's phone.
  const override = (process.env.SCHOOL_API_OVERRIDE || '').trim();
  if (override) {
    if (process.env.EAS_BUILD === 'true') {
      fail('SCHOOL_API_OVERRIDE is set during an EAS build. It is for local development only.');
    }
    console.warn(`\n  ! Using ${override} instead of ${school.apiBaseUrl} (development only)\n`);
    school.apiBaseUrl = override;
  }

  // Parents sign in over this. Plain HTTP would put a password on the
  // network in clear; the only legitimate use is a server on this machine.
  if (!/^https:\/\//.test(school.apiBaseUrl) && process.env.SCHOOL_ALLOW_HTTP !== '1') {
    fail(
      `apiBaseUrl is "${school.apiBaseUrl}". A released app must use https. ` +
        'For a local server, set SCHOOL_ALLOW_HTTP=1.',
    );
  }

  return { slug, dir, school };
}

/** That school's file if it has one, otherwise the shared default. */
const asset = (dir, name, fallback) => {
  const own = path.join(dir, name);
  return fs.existsSync(own) ? `./schools/${path.basename(dir)}/${name}` : fallback;
};

module.exports = () => {
  const { slug, dir, school } = loadSchool();
  const colors = school.colors || {};
  const accent = colors.accent || '#C9A84C';

  // Android push is delivered through Firebase Cloud Messaging, so each
  // branded app needs its own project. Pointing at a file that is not there
  // fails the EAS build with a worse message than this one.
  const googleServices = path.join(dir, 'google-services.json');
  const hasPush = fs.existsSync(googleServices);
  if (!hasPush && process.env.EAS_BUILD === 'true') {
    console.warn(
      `\n  ! schools/${slug}/google-services.json is missing.\n` +
        '    The app will build and run; Android notifications will never arrive.\n',
    );
  }

  return {
    // What a parent sees under the icon. Android truncates at about a dozen
    // characters, so this is the short name, not the school's full one.
    name: school.launcherName || school.shortName,
    slug: `${slug}-app`,
    scheme: slug.replace(/[^a-z0-9]/g, ''),
    version: school.version || '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: asset(dir, 'icon.png', './assets/images/icon.png'),

    android: {
      package: school.androidPackage,
      adaptiveIcon: {
        backgroundColor: colors.splashBackground || '#FFFFFF',
        foregroundImage: asset(
          dir,
          'adaptive-icon.png',
          './assets/images/android-icon-foreground.png',
        ),
      },
      ...(hasPush ? { googleServicesFile: `./schools/${slug}/google-services.json` } : {}),
      predictiveBackGestureEnabled: false,
    },

    ios: {
      bundleIdentifier: school.iosBundleId || school.androidPackage,
      supportsTablet: false,
    },

    web: { output: 'static', favicon: './assets/images/favicon.png' },

    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-splash-screen',
        {
          backgroundColor: colors.splashBackground || '#0F2042',
          image: asset(dir, 'splash.png', './assets/images/splash-icon.png'),
          imageWidth: 160,
        },
      ],
      ['expo-notifications', { color: accent, defaultChannel: 'announcements' }],
    ],

    experiments: { typedRoutes: true, reactCompiler: true },

    /**
     * What the app reads at runtime. One source of truth: the file named on
     * the build command, not whatever happened to be in the environment.
     */
    extra: {
      school: {
        slug: school.slug,
        name: school.name,
        shortName: school.shortName,
        motto: school.motto || '',
        contactEmail: school.contactEmail || '',
        apiBaseUrl: school.apiBaseUrl.replace(/\/$/, ''),
      },
      ...(school.easProjectId ? { eas: { projectId: school.easProjectId } } : {}),
    },
  };
};
