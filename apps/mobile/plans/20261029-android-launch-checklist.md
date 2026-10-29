# Android launch checklist

What stands between the Android work on `android-app-support-check-244611af` and a Play Store
release. Part 1 is for a person: accounts, keys and consoles that no agent can reach. Part 2 is
engineering that is known to be missing. Tick items off here as they land.

Running the app locally needs none of this: `apps/mobile/scripts/android-dev.sh` (see
`.agents/skills/mobile-android-verification/SKILL.md`).

## 0. Decide: the iOS release it starts

- [ ] The last commit on the branch, "Android release config (changes the iOS runtime
      fingerprint)", holds `app.config.ts`, `eas.json`, `apps/mobile/.gitignore`,
      `packages/shared/src/app-identity.ts` and the `assetlinks.json` route. Those files feed the
      iOS runtime version. Merging that commit to main makes `deploy.yml` build and submit a new
      iOS binary, and installed iOS builds stop taking OTA updates until they update. Merge the
      branch without it to ship the Android code dark, then merge it with a planned iOS release.

## 1. Accounts and keys (a person)

Do Google Cloud in both projects that own a `GOOGLE_CLIENT_ID` web client: dev and production.

### Signing

- [ ] **Upload keystore.** In `apps/mobile`: `eas credentials -p android`, production profile,
      let EAS generate the keystore. Copy its SHA-1 and SHA-256.
- [ ] **Play Console app.** Create the app with package `sh.superset.mobile` and accept Play App
      Signing. Copy the app signing key's SHA-1 and SHA-256 from Test and release → App
      integrity.

### Google sign-in (native, Credential Manager)

- [ ] **Android OAuth clients** for `sh.superset.mobile`, one per signing key. No client secret:
  - Debug, dev project only (React Native's shared template keystore):
    `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
  - Upload key SHA-1 (from the keystore step).
  - Play App Signing SHA-1 (from the Play Console step).
- [ ] **OAuth consent screen** complete (app name, support email). Without it the account sheet
      does not show.
- [ ] **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`** set to the project's web client ID in the EAS
      `development`, `preview` and `production` environments. Empty means Android uses the
      browser flow. Locally, copy `GOOGLE_CLIENT_ID` into it.

Sign in with Apple is not offered on Android, by decision. GitHub stays browser-based on both
platforms.

### App Links

- [ ] Put both SHA-256 values (upload key and Play App Signing key, uppercase, colon-separated) in
      `ANDROID_SIGNING_CERT_SHA256` in `packages/shared/src/constants.ts`, and deploy web. Check
      on a device: `adb shell pm verify-app-links --re-verify sh.superset.mobile`, then
      `adb shell pm get-app-links sh.superset.mobile`.

### Play submission

- [ ] **Service account.** In Google Cloud, create a service account with a JSON key; grant it
      release permissions on the app in Play Console → Users and permissions. Upload the key with
      `eas credentials -p android` (Google Service Account) so `eas submit` needs no key path.
- [ ] **First upload by hand.** Google rejects API uploads until one `.aab` is uploaded manually.

### Store listing

The listing lives in `apps/mobile/play-store.config.js`. Its text comes from the App Store listing in
`store.config.js`, and the icon and feature graphic are in `apps/mobile/store/android/`.
`bun apps/mobile/scripts/play-listing.ts` checks it against Play's limits.

- [ ] **Phone screenshots** (2 to 8 PNGs) in `apps/mobile/store/android/phone/`. Take them from the
      review demo account (`APP_REVIEW_EMAIL`), whose organization has sample sessions, never from
      a real account. Use `apps/mobile/scripts/android-dev.sh --shot`.
- [ ] **Push text and images**:
      `PLAY_SERVICE_ACCOUNT_KEY=key.json bun apps/mobile/scripts/play-listing.ts --push`. Needs
      the service account above. The push code has not run against Play yet.
- [ ] **App content forms** in Play Console, answered in `play-store.config.js`: privacy policy,
      app access (demo account from `APP_REVIEW_EMAIL` / `APP_REVIEW_PASSWORD`), ads (none),
      target audience (18+), content rating, Data safety. Review the Data safety answers first:
      PostHog session replay, Sentry, attached photos, and voice audio sent to OpenAI.
- [ ] **Category and tags**: Productivity; add developer tags in Play Console.

## 2. Engineering still missing

### Before a public release

- [ ] **Query cache too large for Android storage.** A "Row too big to fit into CursorWindow" toast
      shows: the persisted query cache is larger than one AsyncStorage row on Android.
- [ ] **Sign-in end to end.** GitHub and Google open their providers, but nobody has finished a
      real login and the redirect back through `superset://` on Android. Native Google needs the
      Google Cloud steps above first.
- [ ] **Sign-in errors.** GitHub and Google ignore `res.error`, so their failures are silent (shared
      with iOS).
- [ ] **Screens not yet checked on a device:** the Page sheets (preview, comments, share), voice
      sheets, the PR checks/reviewers sheets, line comment, and `ValueMenu` in share-invite.
- [ ] **CI and EAS workflows.** `.eas/workflows` jobs are iOS only.
- [ ] **Home-screen name.** Android shows `name` ("Superset"); iOS shows the brand name.

### Composer, after the MVP

From `plans/20261029-android-composer.md`: dictation (needs `SpeechRecognizer`), slash command
suggestions, session tabs, quick keys and the quick-keys action, paste of images and files, PDF and
document thumbnails, swipe-down to dismiss.

### Agent card and push

From `plans/20261029-android-agent-card.md`: the app never asks for notification permission (it
belongs with push registration), "Not updating" is not shown, one tap target per card instead of
per row, and the Android 16 Live Update features are untested (the AVD is API 33). Push is planned
there and not implemented on either platform.
