# Firebase, per school — for push only

Android notifications are delivered through Firebase Cloud Messaging, so each
branded app needs its own Firebase project. That is the **only** thing
Firebase is still used for: sign-in, marks and school data all come from the
school's own server.

Two files come out of this, and they are opposites.

| File | What it is | Where it goes |
|---|---|---|
| `google-services.json` | Identifies the app to FCM. Ships inside the APK; not a secret. | `schools/<slug>/google-services.json`, **committed** |
| Service account key | Can send a notification to every parent at that school. **A secret.** | Uploaded to Expo once, then a password manager. **Never committed** — `.gitignore` refuses the usual filenames. |

## 1. Register the Android app

In the Firebase console for that school's project:

**Project settings → General → Your apps → Add app → Android.**

Not Web. A web app is what the old Firebase-backed version used and it does
nothing for push.

- **Android package name** — must match `androidPackage` in that school's
  `school.json`, character for character. For Nabisunsa:
  `ug.midway.school.nabisunsagirls`
- **Nickname** — anything; "Parents app" is fine.
- **SHA-1** — leave blank. It is for Google Sign-In and Dynamic Links,
  neither of which this app uses.

Register, then **Download google-services.json** and put it in
`schools/<slug>/`. Skip every SDK step Firebase offers afterwards — Expo does
that part.

## 2. Give Expo permission to send

Expo's push service delivers to Android through FCM on your behalf, so it
needs credentials for that project.

**Project settings → Service accounts → Generate new private key.** A JSON
file downloads. Then, in the app repository:

```bash
SCHOOL=<slug> npx eas credentials
```

Choose Android → the production build profile → **Google Service Account** →
**Manage your Google Service Account Key for Push Notifications (FCM V1)** →
upload the file you just downloaded.

Then delete the downloaded copy, or move it into a password manager. It is
not needed again unless the key is rotated.

## Checking it worked

`npm run schools:check` stops warning about a missing `google-services.json`
for that school. Push itself can only be confirmed on a real device — the
web build cannot receive a notification, and a simulator will not either.
