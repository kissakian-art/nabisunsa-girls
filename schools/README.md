# One school per folder

This is what makes a branded app per school possible from one codebase. A
build names the school and everything else follows:

```bash
SCHOOL=nabisunsa-girls npx eas build --platform android --profile production
```

Each folder holds that school's `school.json` and, optionally, its own
artwork and push credentials:

```
schools/nabisunsa-girls/
  school.json           required
  icon.png              1024×1024, square. Falls back to the Midway default.
  adaptive-icon.png     432×432 foreground, transparent, Android
  splash.png            the crest, on the splash background colour
  google-services.json  from that school's Firebase project — Android push
```

## Why not .env

The branding used to come from `EXPO_PUBLIC_*` variables. That works until
the day you build Seeta's app with Nabisunsa's `.env` still in place and
publish it to Google Play under Seeta's name — a mistake with no quiet fix,
because the wrong app is already on parents' phones. A committed file per
school is reviewable, diffable, and named on the build command.

`app.config.js` refuses to build without `SCHOOL`, refuses a slug that does
not match its folder, and refuses a plain-HTTP API address unless you say
`SCHOOL_ALLOW_HTTP=1`, which is for a local server and nothing else.

## Adding a school

1. `cp -r schools/_template schools/<slug>` and fill in `school.json`. The
   slug must match the folder name **and** the slug the console created for
   that school — the app sends it with every sign-in.
2. `androidPackage` must be unique on Google Play and can never change for
   that app. `ug.midway.school.<slugwithoutdashes>` is the convention.
3. Drop in the artwork. Without it the app builds with Midway's default
   icon, which is fine for a test build and not for Google Play.
4. Create that school's Firebase project for push, download
   `google-services.json` into the folder. Without it the app builds and
   runs, and notifications silently never arrive on Android.
5. `npm run schools:check` — it validates every school folder and is worth
   running before a build rather than after one.

## What is deliberately not here

No API keys, no passwords, no Firebase secrets beyond `google-services.json`
(which is not a secret: it identifies the app to FCM and is designed to ship
inside the APK). Anything genuinely secret lives on the server.
