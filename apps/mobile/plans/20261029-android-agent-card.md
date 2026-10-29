# Android agent card (and push, planned only)

Step 5 of Android support. Status: MVP implemented on branch `android/05-live-activity-push`.
Push is **not** implemented; the second half of this plan is the design for it.

## Today on iOS

- Contract: `modules/live-activity/src/LiveActivity.types.ts` (`LiveActivityModule`,
  `AgentSnapshot`, `AgentRow`).
- Caller: `screens/(authenticated)/(home)/home/hooks/useAgentLiveActivity`. Home polls host
  terminals every ~5 s, builds a snapshot of agents that want attention (permission, failed,
  review, working), keeps the four most urgent rows, and starts/updates/ends one card. It only
  runs in the foreground; `staleAfterSeconds: 120` lets the card say "Not updating" when the app
  stops feeding it.
- Native: ActivityKit Live Activity (`modules/live-activity/ios`) drawn by the WidgetKit
  extension `targets/agentactivity`. Started with `pushType: nil`: no remote updates.

## Closest Android equivalent

| iOS                               | Android                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| Live Activity on Lock Screen      | Ongoing notification, `VISIBILITY_PUBLIC`                      |
| Dynamic Island compact view       | Android 16+ Live Update status bar chip (`setShortCriticalText`) |
| Pinned at top of Lock Screen      | Android 16+ promoted ongoing notification (Live Update)          |
| `staleDate` → "Not updating"      | `setWhen(now)` + `setShowWhen`: the shade shows "5m" by itself   |
| Per-row `Link` deep links         | One `contentIntent`; actions are at most three buttons          |
| App Group icon cache              | App `cacheDir`, read back as the large icon                     |
| ActivityKit push token            | FCM data message that rebuilds the notification (see Push)      |

**Live Updates (Android 16, API 36).** A notification is promoted when it asks with
`setRequestPromotedOngoing(true)`, the manifest has the normal permission
`POST_PROMOTED_NOTIFICATIONS`, and it has promotable characteristics: ongoing, a content title,
Standard / BigText / Call / Progress / Metric style, not colorized, no custom `RemoteViews`, not a
group summary, channel importance above MIN. The user can turn promotion off per app
(`NotificationManager.canPostPromotedNotifications()`, settings intent
`ACTION_MANAGE_APP_PROMOTED_NOTIFICATIONS`). Source:
<https://developer.android.com/develop/ui/views/notifications/live-update>.

`ProgressStyle` is the "progress-centric" template. Our card is a list of agents, not one
journey with a progress bar, so it uses **BigTextStyle** (promotable). `InboxStyle` would draw the
rows more cleanly but is not promotable, and a custom `RemoteViews` layout (the only way to get
per-row icons and colours like the iOS card) is also not promotable. We take promotion over
layout.

## MVP (implemented)

Same contract, no caller changes; iOS is unchanged.

- `modules/live-activity/expo-module.config.json` adds `android`; the binding
  `LiveActivity.ios.ts` is renamed `LiveActivity.native.ts` so both platforms load the native
  module. `LiveActivity.ts` stays the fallback for web and `bun test`.
- `android/…/LiveActivityModule.kt` maps the contract:
  - `areActivitiesEnabled`: app notifications on and the `agent-status` channel not blocked.
  - `activeIds`: our notification (tag `agent-card`) in `getActiveNotifications()`. Like
    ActivityKit, this is the source of truth across relaunches and user dismissal.
  - `cacheIcon`: download, scale to 144 px, write `cacheDir/agent-card-icons/<key>.png`.
  - `start` / `update`: post the notification; `update` with an id that is gone does nothing.
  - `endAll`: cancel it.
- `AgentCard.kt` builds it. Title "`<status> · <workspace>`" of the most urgent row; collapsed
  text is the project and time for one agent, or the other names plus "+N more"; expanded
  BigText has one line per row. Accent colour from `topState` (the iOS dark-mode tones). Tap
  opens `superset:///workspace/<id>?tab=<terminal>` when one agent is on the card, Home
  otherwise. On API 36+ it requests promotion and sets the top status as the chip text.
- Channel `agent-status`, `IMPORTANCE_LOW` (never sounds), name in Android string resources for
  all 17 shipped locales.
- Small icon: the white bracket mark from `targets/agentactivity`, padded square, 5 densities.

### Known gaps

- **Runtime permission.** On Android 13+ `POST_NOTIFICATIONS` must be granted. Nothing in the
  app asks today (iOS needs no permission for Live Activities), so `areActivitiesEnabled()` is
  false until the user grants it. The push work below adds the prompt; until then, grant with
  `adb shell pm grant sh.superset.mobile android.permission.POST_NOTIFICATIONS`.
- **No "Not updating" text.** `staleAfterSeconds` and `staleDetail` are ignored; the shade's
  relative time is the stale signal. A follow-up can schedule an inexact `AlarmManager` alarm at
  `staleAfterSeconds` whose receiver re-posts the last snapshot with `staleDetail` as sub-text.
- **One tap target.** Rows cannot each deep-link. Option: up to three actions, "Open <name>",
  for the top rows.
- **Not verified on Android 16.** The local AVD is API 33, so promotion and the chip are
  compiled and gated on `SDK_INT >= 36` but have not been seen running.
- Android 14+ lets users swipe away ongoing notifications that are not foreground services.
  That matches iOS, where the user can dismiss a Live Activity; the hook starts a new card on
  the next change.

## Push (not implemented)

### What it replaces

The card is fed only by the foreground poll in `useAgentLiveActivity`. The moment the phone
locks, the card freezes, and `staleAfterSeconds` exists only to admit that. Push replaces:

1. the foreground-only feed of the card (iOS `pushType: nil`, Android local `notify`) with
   server-driven updates while the app is backgrounded or killed;
2. the "Not updating" crutch as the normal state on a locked phone;
3. (new) a plain alert notification when an agent starts needing you and no card is running.

### Token registration, both platforms

One path for both: **Expo push tokens** (`ExponentPushToken[…]`) from `expo-notifications`,
which is already installed (`app.config.ts`: `enableBackgroundRemoteNotifications: false`). Expo
fans out to APNs and FCM v1.

- **Credentials.** APNs key (.p8) and FCM v1 service account JSON uploaded to EAS
  (`eas credentials`). Android also needs `android.googleServicesFile` in `app.config.ts`
  (a `google-services.json` from a Firebase project for `sh.superset.mobile`).
- **Mobile.** `apps/mobile/lib/push/` (seam per the AGENTS convention: `registerPush.types.ts`,
  `.native.ts`, fallback `.ts`), called once from the authenticated layout:
  1. ask permission (`requestPermissionsAsync`; on Android 13+ this is the `POST_NOTIFICATIONS`
     prompt the card also needs), behind a soft prompt, never at cold start;
  2. `getExpoPushTokenAsync({ projectId })`;
  3. `push.registerToken` with token, platform, a stable install id, app version;
  4. re-register on `addPushTokenListener` and on every sign-in; `push.unregisterToken` on
     sign-out.
- **Live Activity tokens (iOS only).** A Live Activity started with `pushType: .token` gets its
  own per-activity APNs token (`activity.pushTokenUpdates`). Expo's push service is not
  known to send `liveactivity` pushes (check before building), so plan on sending these
  **directly to APNs** (token-based auth with the same .p8,
  `apns-push-type: liveactivity`, topic `<bundle id>.push-type.liveactivity`). The contract
  grows an optional `onPushToken(activityId, token)` event; Android has no equivalent token: a
  high-priority FCM *data* message to the device token rebuilds the card in a
  `FirebaseMessagingService` (or the expo-notifications background task), using
  `AgentCard.post` with the snapshot from the payload.

### Where it lives server-side

- **DB** (`packages/db/src/schema`): `push_tokens` (id, user_id, organization_id, install_id,
  platform `ios|android`, expo_token unique, live_activity_token nullable, app_version,
  created_at, last_seen_at, disabled_at). Generated with the db-migrations skill.
- **tRPC** (`packages/trpc/src/router/push/`, mounted in the root router):
  `registerToken`, `unregisterToken`, `registerLiveActivityToken` as `protectedProcedure`s.
  New procedures only, so released clients are unaffected (trpc-compat).
- **Sender** (`packages/trpc/src/lib/push/` or a shared package): Expo push via
  `expo-server-sdk` (batches of 100, receipts checked later; `DeviceNotRegistered` sets
  `disabled_at`), plus a small APNs client for Live Activity updates.
- **Trigger.** The API does not know agent state today; the host-service does (agent lifecycle
  events, `packages/host-service/src/events/map-event-type.ts`) and the phone reads it through
  the relay. The host-service would report state *transitions* (not every poll) to a new host-authenticated procedure, e.g.
  `push.agentStateChanged`, through its existing API client
  (`packages/host-service/src/api/createApiClient`). The API rolls them up per user into the
  same `AgentSnapshot` shape and sends: an alert on `→ permission` / `→ failed`, a silent card
  update otherwise, rate-limited (APNs budgets Live Activity updates).
- **API env** (`apps/api/src/env.ts`): `EXPO_ACCESS_TOKEN`, `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `APNS_PRIVATE_KEY`. Follow `docs/environment-variables.md`.

### Order

1. Permission prompt + token registration + `push_tokens` (no sending): measurable opt-in.
2. Alert pushes on `permission` / `failed` transitions (both platforms through Expo).
3. Remote card updates: iOS Live Activity APNs, Android FCM data → `AgentCard`.
4. Remove `staleAfterSeconds` once remote updates keep the card fresh.
