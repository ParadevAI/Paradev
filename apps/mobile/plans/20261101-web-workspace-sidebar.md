# Web: a workspace list beside the open workspace

Status: plan, not started. Follows `android/18-web-desktop-layout` (report 18, proposal P1).

## Goal

At 1100 px and wider, `/agents` keeps Home's workspace list in a left column while a workspace is
open. A click in the list swaps the workspace on the right; Home's own screen is unchanged.
Phones, tablets and the iOS/Android apps do not change.

This is the web side of the split view in `20261028-iphone-duo-native.md` (workspaces in the
primary column, the workspace in the detail). Use the same shape so the two can share the list.

## Why it is not in report 18

The list is not a component yet. `HomeScreen` (≈900 lines) owns the data and the rows together:
host or cloud scope, sort, pins, archived, collapsed projects, terminal attention, diff stats,
the paywall and the offline states. A sidebar that reuses it needs that split first, and the split
touches the iOS Home screen. That is a separate, reviewable change, not a layout seam.

## Steps

1. **Extract the list.** Move the data wiring out of `HomeScreen` into a hook
   (`useHomeList`: entries, `renderListItem`, viewability) and a `WorkspaceList` component that
   renders it. `HomeScreen` becomes header + scope bar + `WorkspaceList` + composer. Verify iOS
   Home is pixel-identical (simulator screenshots before and after) and the fingerprint is unchanged.
2. **Add a compact row variant.** `WorkspaceRow` gets a `dense` form for a 280 px column: name,
   branch, attention dot. It keeps `RowLink`, so links keep working.
3. **Add the web shell.** A `WorkspaceShell` seam in `lib/layout`: `.tsx` renders its children;
   `.web.tsx` renders `[WorkspaceList | children]` when the window is ≥ 1100 px and the focused
   route is under `/workspace/[id]`. Mount it around the `<Stack>` in
   `app/(authenticated)/_layout.tsx`, so the list stays mounted (scroll and collapse state survive)
   while the stack changes screens. Highlight the row that matches the route's `id`.
4. **Navigate in place.** A plain click in the sidebar uses `router.replace` from one workspace to
   another, so browser Back returns to Home rather than walking through every workspace opened.
   ⌘-click still opens a tab (it is a `RowLink`).
5. **Keep the column.** The workspace keeps `useColumnInset`, computed from the remaining width
   (a layout measurement, not the window), so chat and composer stay centred in the detail pane.

## Checks

- Web at 1440×900 and 1100×800: list beside chat and terminal; resize below 1100 hides it.
- Web at 1024 and 390: as in report 18.
- iOS fingerprint and Home screenshots unchanged; Android Home unchanged.
- Sheets (sessions, new session) still open over the whole page.

## Open questions

- Should the sidebar show sessions under each workspace (desktop app style) or workspaces only?
  Start with workspaces only.
- Collapsible sidebar (a toggle in the header) or always on at ≥ 1100 px? Start always on.
