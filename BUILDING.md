# Building a school's app

One codebase, one app per school. The build names the school; everything
else — the name under the icon, the icon itself, the package name, which
server it talks to — comes from `schools/<slug>/school.json`.

```bash
npm run schools:check                  # before, not after
npx eas build --platform android --profile nabisunsa-girls
```

**The profile names the school**, not a shell variable. EAS evaluates
`app.config.js` on its own build servers, where a variable you exported on
your laptop does not exist — so the school travels in `eas.json`, where the
build server can read it. It also means the command is identical on Windows,
where `SCHOOL=x npx eas build` is not valid syntax at all.

Each school gets two profiles: `<slug>` builds an APK you can put on a real
phone, `<slug>-production` builds the app bundle Google Play wants. Nothing
else differs between them. `npm run schools:check` refuses a school that has
neither.

## Running it locally

```bash
npm install
npm start                                # the only school, or the first
npm start -- --school seeta-high         # name one
npm start -- --web                       # anything else goes to expo
```

Windows, macOS and Linux all the same — `npm start` runs a small Node script
rather than shell syntax, for the same reason as above.

Against a portal on this machine rather than the real one:

```bash
npm start -- --school nabisunsa-girls
```

with `SCHOOL_ALLOW_HTTP=1` and `SCHOOL_API_OVERRIDE=http://127.0.0.1:4500`
set in the environment. The override is refused during an EAS build: an app
shipped pointing at 127.0.0.1 works perfectly on the machine that built it
and on no parent's phone, so that mistake is made impossible rather than
documented.

## A new school, end to end

1. **On the server**, in the console at `/platform`, add the school. Note the
   slug it was given.
2. **Here**, `cp -r schools/_template schools/<slug>`, fill in `school.json`,
   and use exactly that slug — the app sends it with every sign-in.
3. Drop in `icon.png`, `adaptive-icon.png` and `splash.png`. Without them the
   app builds with Midway's default icon, which is fine for a test and not
   for Google Play, where the badge is the entire point.
4. **Firebase**, once per school — see `docs/FIREBASE-PUSH.md` for the exact
   clicks. Two files come out of it and they are opposites: the committed
   `google-services.json`, and a service-account key that must never be
   committed and is uploaded to Expo instead. Without this the app runs and
   notifications silently never arrive. Budget an hour.
5. Add two build profiles to `eas.json`, copying the Nabisunsa pair and
   changing the slug. Without them EAS builds the wrong school, or refuses.
6. `npx eas init` — creates the EAS project. Put the id it prints into
   `easProjectId` in `school.json`.
7. `npm run schools:check`, then build.

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
