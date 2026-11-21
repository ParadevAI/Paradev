# iPhone Duo: native layout on Expo SDK 58 with a native split view

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, and `Decision Log` up to date.

## Purpose

PR #9000 made the app fit the iPhone Duo with React Native layout code: a JS card grid on Home, a
two-column Settings, and every screen root wrapped in a `SafeAreaView`. It also shipped on the
`sdk-57` EAS image (Xcode 26.6), so the Duo ran the app in its compatibility window and the native
button rail never appeared. This plan replaces that with what Apple asks for:

1. System bars, so header buttons move into the Duo's vertical rail (iOS 27.1 SDK).
2. Foreground content in the safe area, backgrounds behind the bars (pad content containers).
3. Layout from the window, never idiom or orientation.
4. A split view when there is room: workspaces in the primary column, the workspace in the detail.

## Decisions (agreed with Satya, 2026-10-28)

- SDK 58 upgrade lands in the same PR as the Duo work; push to the fork PR #9000.
- Packages inside the 3-day `minimumReleaseAge` window may be excluded in `bunfig.toml`.
- Split view is built now, on react-native-screens `5.0.0-alpha.4` plus the unmerged PoC
  software-mansion/react-native-screens#4666 (`Split.Stack`, `Split.Screen`, `Split.HeaderConfig`)
  rebased as a patch. No published version has stacks or headers in split columns.
- The sidebar header is our own module only if the PoC header config does not cover it.

## Milestones

- A. SDK 58 on react-native-screens 4.30.1: deps, React 19.3 across the monorepo, patches, code
  fixes, `eas.json` image. Typecheck, lint, tests green.
- B. react-native-screens 5.0.0-alpha.4 + PoC rebased; port our Stack v4 patches; guard tests.
- C. Split navigator: routes to column stacks, auth guards as redirects, form sheets.
- D. Remove `sideSafeAreaLayout`, the Home grid, and two-column Settings; pad content containers;
  verify on the EAS simulator (iPhone, iPad, Duo if the image has it).

## Progress

- [x] (2026-10-28) Review of #9000 against Apple's tech talk and Expo's Duo guide.
- [x] (2026-10-28) Milestone A, uncommitted: expo 58.0.21, RN 0.88.1, screens 4.30.1, React and
  @types/react 19.3.0 across the monorepo, release-age excludes, patches moved (screens sheet fix is
  upstream since 4.30, interactive push re-applied; expo-observe carried), RN 0.88 ref/event types,
  webview 14 generic, masked-view cast, `eas.json` on `macos-tahoe-26.6-xcode-27.1` with a guard
  test. Mobile typecheck and 246 tests pass. Native build not yet run.
- [ ] Milestone B
- [ ] Milestone C
- [ ] Milestone D

## Surprises & Discoveries

- expo-router 58 `SplitView` throws inside any native navigator; the root layout is a `Stack` with
  `Stack.Protected`, so auth gating must become redirects.
- react-native-screens 4.30.1 (2026-10-28) adds `RNSNavigationItemCustomizing`: a direct child of a
  split screen gets the column's `UINavigationItem` at mount. expo/expo#52373 (open) builds headers on it.
- A split column is one `UINavigationController` with one screen; an expo-router `Stack` inside it
  nests navigation controllers and shows two bars when collapsed on iPhone.
- PoC #4666 is based on main from 2026-09-08 and conflicts with `5.0.0-alpha.4` from its first commit.
  Commit 1 is already in alpha.4. Commit 2 ("Neutral header family") renames `ios/stack/header` to
  `ios/header` and the Fabric components to `RNSHeader*IOS`, and also adds new files; it conflicts in
  14 files. Local reconstruction: `/tmp/rns-src/repo` (branches `base`, `poc`, `alpha4`) from
  codeload tarballs, since git over HTTPS to GitHub needs auth here.
- No Xcode in the cloud sandbox and every Mac host is offline, so each native compile of the
  patched screens is an EAS build.

## Decision Log

- Reject the PR's JS grid and root-level `SafeAreaView`: Expo says pad the content container, not
  the root, and Apple's open-display answer is a split view, not a different design.
