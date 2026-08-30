# Building a school's app

One codebase, one app per school. The build names the school; everything
else — the name under the icon, the icon itself, the package name, which
server it talks to — comes from `schools/<slug>/school.json`.

```bash
npm run schools:check                  # before, not after
SCHOOL=nabisunsa-girls npx eas build --platform android --profile preview
```

`preview` produces an APK you can put on a real phone. `production` produces
the app bundle Google Play wants. Nothing else changes between them.

## Running it locally

```bash
npm start                              # defaults to nabisunsa-girls
SCHOOL=seeta-high npm start            # or name one
```

Against a portal on this machine rather than the real one:

```bash
SCHOOL=nabisunsa-girls SCHOOL_ALLOW_HTTP=1 \
  SCHOOL_API_OVERRIDE=http://127.0.0.1:4500 npm start
```

`SCHOOL_API_OVERRIDE` is refused during an EAS build. An app shipped pointing
at 127.0.0.1 works perfectly on the machine that built it and on no parent's
phone, so that mistake is made impossible rather than documented.

## A new school, end to end

1. **On the server**, in the console at `/platform`, add the school. Note the
   slug it was given.
2. **Here**, `cp -r schools/_template schools/<slug>`, fill in `school.json`,
   and use exactly that slug — the app sends it with every sign-in.
3. Drop in `icon.png`, `adaptive-icon.png` and `splash.png`. Without them the
   app builds with Midway's default icon, which is fine for a test and not
   for Google Play, where the badge is the entire point.
4. **Firebase**, once per school: create a project, add an Android app with
   that school's package name, download `google-services.json` into the
   school's folder. Android push is delivered through FCM, so without this
   the app runs and notifications silently never arrive. Budget an hour.
5. `SCHOOL=<slug> npx eas init` — creates the EAS project. Put the id it
   prints into `easProjectId` in `school.json`.
6. `npm run schools:check`, then build.

## Why the package name can never change

`androidPackage` is how Google Play identifies the app forever. Changing it
publishes a *second* app, leaving every parent on the first one with no
update path. `ug.midway.school.<slugwithoutdashes>` is the convention; get it
right once.

## What is checked, and what is only warned about

`app.config.js` refuses to build at all without `SCHOOL`, with a slug that
disagrees with its folder, with an invalid package name, or with a plain-HTTP
address for a release.

`npm run schools:check` additionally catches what a single build cannot see:
two schools sharing a package name — which the Play Console rejects, long
after the mistake — or sharing a slug.

Missing artwork, missing `google-services.json` and a missing EAS project id
are notes rather than failures: the app builds and works without them, and
the school just does not get its badge or its notifications.
