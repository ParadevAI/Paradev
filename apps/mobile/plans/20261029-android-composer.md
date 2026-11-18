# Android composer

This ExecPlan is a living document. Keep `Progress`, `Missing after the MVP`, and `Decision Log`
up to date.

## Purpose

`Composer.tsx`, the fallback that Android resolves to, renders `null`, so Android has no chat input
on Home or in a workspace. This plan gives Android a composer to the same contract
(`modules/composer/src/Composer.types.ts`) as the iOS view, without changing iOS.

## Decision: React Native (`Composer.android.tsx`), not a Kotlin Expo module

| | React Native `Composer.android.tsx` | Kotlin module (`modules/composer/android`) |
|---|---|---|
| Why iOS went native | Liquid Glass, SwiftUI keyboard avoidance, an overlay view controller with its own safe area. None of these exist on Android. | Would rebuild the same overlay with Compose and `WindowInsets.ime`, a second large codebase. |
| Overlay | An absolute-fill `box-none` view over the screen. The callers already render the composer as the last child of the screen root (`HomeScreen`, `WorkspaceScreen`), so it overlays without a portal. | A full-screen `ComposeView` added to the activity's decor view, plus hit-test passthrough. |
| Keyboard | SDK 58 is edge-to-edge, so the window does not resize: the composer pads itself by the keyboard height from `Keyboard` events. | `WindowInsetsAnimationCompat` gives a frame-exact animation. Better, but only visible as polish. |
| Theme and icons | `lucide-react-native` and the app's dark palette, the same art the rest of the app draws. | A second icon set and colour table in Kotlin. |
| Iteration | Metro reload. No Gradle build, which matters with one build slot shared by five agents. | A Gradle build per change. |
| Seams | Adds one file. `Composer.ios.tsx` and the `expo-module.config.json` platforms stay as they are. | Rename the binding to `Composer.native.tsx`, add `"android"` to `platforms`, and keep both natives in step on every prop. |
| `presentImage` / `fileThumbnail` | A viewer `Modal` hosted by the mounted composer; image thumbnails through `expo-image-manipulator`. No PDF preview. | Native `PdfRenderer` thumbnails and a system image viewer. |

Pick React Native. The iOS reasons for going native are iOS-specific; on Android the cost is a second
native codebase and slow iteration for little visible gain. A Kotlin module stays open later for one
piece at a time, for example a `fileThumbnail` with `PdfRenderer` or dictation with
`SpeechRecognizer`, behind the same contract.

## Shape

- `modules/composer/src/Composer.android.tsx` exports `Composer`, `presentImage`, `fileThumbnail`,
  annotated with the contract types. It imports nothing from `@/`, like the rest of the module.
- Expanded is "the text field has focus". Focus opens it, blur closes it, `onExpandedChange` reports
  each change. `focus()`/`blur()` on the handle drive the field.
- Collapsed: one row, `+` · mini thumb with `+N` · one line of draft or the placeholder · send/stop.
- Expanded: header chips, attachment tray with ✕ and upload state, a multi-line editor (4-line
  floor, 2 with `compactEditor`), then the toolbar: `+` · mode menu · agent picker · launch options ·
  send/stop. `dim` draws a scrim that blurs on tap; `passthrough` draws none.
- `onHeightChange` reports the card and the rows around it, without the keyboard and the bottom
  safe area, as on iOS.
- SF Symbol names in the contract (`ComposerModeOption.symbol`, `ComposerQuickKey.symbol`,
  `ComposerQuickKeysAction.symbol`) go through one map to lucide icons, with a fallback icon.

## Missing after the MVP

- Upload rings drawn as rings (the composer draws a dimmed thumbnail with a percentage) and an
  animated collapse.
- The quick-keys action takes its room at once; iOS animates the keys sliding over.
- Paste through the system menu or a keyboard's image insert: RN 0.88 `TextInput` takes text only,
  so images and files paste through the composer's own Paste control.
- Thumbnails for documents other than PDFs that sit in the app's cache (file URIs); content URIs
  use the provider's own preview.

## Progress

- [x] (2026-10-29) Plan and decision.
- [x] (2026-10-29) MVP `Composer.android.tsx`.
- [x] (2026-10-29) Verified on the `Pixel_2_API_33` emulator through a temporary route that drove
  every prop and handle method: collapsed and expanded states, the keyboard lift, `dim` and
  `passthrough`, Back to collapse, tray remove and upload states, send held while uploading,
  `isSending`, `canStop`/`onStop`, `clear`, `appendDraft`, the mode menu, `presentImage` and
  `fileThumbnail`. Home and the workspace screen are not verified yet: they need a signed-in session
  against a local API.
- [x] (2026-10-29) Header chips moved into the card, so the Home project chip no longer sits over the
  list header behind the composer.
- [x] (2026-10-29) Session tabs (pills, attention dots, close disc, press-and-hold menu, scroll-back
  chevron, new and all sessions), quick keys and the quick-keys action, and slash suggestions
  (`utils/slashSuggestions`, the same matching as iOS `ComposerSlashMatching`). One bottom
  `ComposerMenuSheet` serves the mode menu and the tab menu.
- [x] (2026-10-29) Verified on `Paradev_A2` (emulator-5556) against the local API: Home new chat
  (chip in the card, keyboard lift, no slash panel since Home passes no commands); the real
  `TerminalComposer` through a temporary route with stand-in tabs, keys and commands (every
  callback, menu, chevron, slash filter and commit, submit and clear); the Page reply bar
  `ComposerCard` with a seeded thread (lift, post). The workspace screen with a live host is not
  verified: no host-service was connected.

- [x] (2026-10-30) Dictation, paste, document thumbnails and swipe-down, behind seams in
  `modules/composer/src`: `utils/dictation` (`.android.ts` on `SpeechRecognizer`, `.web.ts` on the
  Web Speech API, `.ts` hides the mic), `hooks/useAttachmentPaste` (Android clipboard, the
  browser's paste event), `utils/fileThumbnail` (`PdfRenderer` and the provider's preview on
  Android). The Kotlin lives in `modules/composer-android`, an Android-only module, so iOS native
  code and its fingerprint do not move. Verified on `Paradev_A3` (emulator-5558).

## Surprises & Discoveries

- Fabric flattens a layout-only `View`. The field's wrapper had a layout-only style when expanded
  and `opacity: 0` when collapsed, so each change re-parented the field and Android moved focus to
  the next focusable view. `collapsable={false}` keeps the wrapper.
- `keyboardDidShow` on Android reports the keyboard height without the navigation bar below it, so
  the lift is `keyboard + insets.bottom`.
- Back lowers the keyboard without blurring the field, so the composer blurs on `keyboardDidHide`.
- `CI=1 expo start` turns off Metro's file watcher: a cold restart still gets the old bundle.
- The emulator shows the soft keyboard only after the first key input; it is not an app bug.
- `TerminalComposer` wrapped the composer in a plain `<View>` with no size. The iOS view draws in
  its own overlay, so it never mattered there; the Android overlay sized itself to that 0×0 view
  and drew nothing. The wrapper now fills the screen with `box-none`.
- Google's recogniser reads `EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS` as an Integer and
  ignores a Long, and ends each session after a pause; the module starts it again until stop.
- The Android attachments sheet settled before it hid, so settling unmounted it and `hide()` was
  rejected: Files and Photos never opened. It hides first now.
- `android-dev.sh` reused its saved Metro port even when another worktree's Metro held it, and
  loaded that worktree's bundle. It now reuses the port only while its own Metro runs or the port
  is free.

## Decision Log

| Date | Decision |
|---|---|
| 2026-10-29 | React Native over a Kotlin module, for the reasons in the table above. |
| 2026-10-29 | Header chips sit inside the card, at its top, rather than floating above it. |
| 2026-10-29 | Context menus (tab press-and-hold, mode) are one bottom sheet; Android has no SwiftUI `Menu`. |
| 2026-10-30 | Native pieces go in a separate Android-only module (`modules/composer-android`), not `modules/composer/android`: adding `"android"` to the composer's module config would move the iOS fingerprint. |
| 2026-10-30 | Paste of images and files is a Paste control that shows while the clipboard holds them. Reading only the clip description keeps Android's "pasted" toast for the paste itself. |
| 2026-10-29 | Expanded means focused. The collapsed row shows a one-line label over a transparent field, rather than restyling the field, so the head of a long draft shows with an ellipsis, as on iOS. |
