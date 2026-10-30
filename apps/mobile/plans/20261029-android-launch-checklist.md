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

**Status 2026-10-29:** Superset Inc.'s organization developer account exists: developer name
"Paradev", account ID 8938663520557055179, owned by kiet@superset.sh. The website (superset.sh) is
verified. The organization document (IRS Letter 147C) and Kiet's ID are with Google for review;
the phone check and **Create app** unlock after Google emails kiet@superset.sh.

Do Google Cloud in both projects that own a `GOOGLE_CLIENT_ID` web client: dev and production.

### Signing

- [x] **Upload keystore.** Done 2026-10-29 (EAS, default build credentials). SHA-1
      `D1:FE:00:E3:8F:27:B5:90:28:3D:3A:D0:D5:33:ED:D0:ED:65:BA:F1`, SHA-256
      `01:19:18:27:15:2A:D2:39:1B:FE:BC:D0:AD:A1:2D:89:28:1A:5C:42:04:EA:26:6C:0A:54:E8:47:23:E5:C1:93`.
      Was: In `apps/mobile`: `eas credentials -p android`, production profile,
      let EAS generate the keystore. Copy its SHA-1 and SHA-256.
- [ ] **Play Console app.** Create the app with package `sh.superset.mobile` and accept Play App
      Signing. Copy the app signing key's SHA-1 and SHA-256 from Test and release → App
      integrity.

### Google sign-in (native, Credential Manager)

- [ ] **Android OAuth clients** for `sh.superset.mobile`, one per signing key, in project
      `fair-scout-481221-v0` (it holds both the Web and Web Dev clients). Debug and upload-key
      clients created 2026-10-29; the Play App Signing one waits for the Play app. No client secret:
  - Debug, dev project only (React Native's shared template keystore):
    `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
  - Upload key SHA-1 (from the keystore step).
  - Play App Signing SHA-1 (from the Play Console step).
- [x] **OAuth consent screen** (already live for web sign-in) complete (app name, support email). Without it the account sheet
      does not show.
- [x] **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`** Done 2026-10-29: production and preview use the Web
      client, development uses Web Dev. Was: set to the project's web client ID in the EAS
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

- [x] **Phone screenshots** — 3 drafts taken 2026-10-29 from the review account on production
      (Home, workspace sheet, new task). Retake the new-task shot once the Android composer's project
      chip stops overlapping the list header. Was: (2 to 8 PNGs) in `apps/mobile/store/android/phone/`. Take them from the
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

**Review demo account.** `appreview@superset.sh` (team "App Review", `9617bc8e-…`) had read as
Free since the Oct 20 Autumn cutover, so App Store and Play reviewers would only see the paywall.
Fixed 2026-10-29: Autumn customer created and the Team plan attached with the seat price customized
to $0 (3 seats, 216,000 box GB-minutes, overage billing off, past-due ignored). The demo host
`acme-devbox` and its sample workspaces were already there.

## 2. Engineering still missing

### Before a public release

- [x] **Query cache too large for Android storage.** Done: Android keeps the persisted query cache
      in a file, not one AsyncStorage row, so the "Row too big to fit into CursorWindow" toast is gone.
- [ ] **Sign-in end to end.** GitHub and Google open their providers, but nobody has finished a
      real login and the redirect back through `superset://` on Android. Native Google needs the
      Google Cloud steps above first.
- [x] **Sign-in errors.** Done: a failed GitHub or Google sign-in shows its error (both platforms).
- [ ] **Screens not yet checked on a device:** the Page sheets (preview, comments, share), voice
      sheets, the PR checks/reviewers sheets, line comment, and `ValueMenu` in share-invite.
- [ ] **CI and EAS workflows.** `.eas/workflows/deploy-android.yml` builds and submits to the Play
      internal track, run by hand. It moves into `deploy.yml` after the first manual upload and once
      Android takes OTA updates (`RELEASE.md`).
- [x] **Home-screen name.** Done: `withAndroidLabel` sets the launcher label to the brand name.

### Composer, after the MVP

From `plans/20261029-android-composer.md`. Done: session tabs, quick keys, slash command
suggestions. Still open: dictation (needs `SpeechRecognizer`), paste of images and files, PDF and
document thumbnails, swipe-down to dismiss.

### Agent card and push

From `plans/20261029-android-agent-card.md`. Done: the app asks for notification permission when
the first agent card would show, a stale card says "Not updating", and each row opens its own
session. Still open: the Android 16 Live Update features are untested (the AVD is API 33), and push
is planned there but not implemented on either platform.
