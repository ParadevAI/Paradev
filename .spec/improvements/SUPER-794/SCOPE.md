---
ticket_id: SUPER-794
ticket_url: https://linear.app/superset-sh/issue/SUPER-794/cmdw-in-a-browser-pane-closes-the-whole-window-instead-of-the-focused
tracker: linear
branch: improvement/SUPER-794-cmdw-browser-pane-closes-window
chosen_option: minimum
loc_budget: 80
task_chunks: 1
investigator_specialist: electron-reviewer
challenger_specialist: code-reviewer
status: binding
---

# SUPER-794: CmdW in a browser pane closes the whole window instead of the focused pane

## Defect
**Symptom:** When keyboard focus is inside a browser pane (Electron `<webview>`), pressing Cmd+W closes the entire application window instead of just the focused pane.
**Observed:** Cmd+W triggers the File menu's "Close Window" action, terminating the entire BrowserWindow.
**Expected:** Cmd+W should close only the focused browser pane, matching the behavior when focus is in terminal or other pane types.

## Reproduction
1. Open the desktop app and create a browser pane (Cmd+Shift+B)
2. Click inside the browser pane to give it keyboard focus
3. Press Cmd+W
4. **Observed:** Entire window closes
5. **Expected:** Only the browser pane closes, other panes remain open

**Evidence:** Static code-path analysis at `.spec/improvements/SUPER-794/reproduction-trace.md`

## Root cause
The Electron `<webview>` tag runs guest web contents in a separate renderer process. When the guest has keyboard focus:
- Renderer-side `react-hotkeys-hook` handlers (CLOSE_PANE, CLOSE_TERMINAL) do not receive keystrokes
- Application-menu accelerators still fire at the BrowserWindow level
- `apps/desktop/src/main/lib/menu.ts:31` defines `{ label: "Close Window", role: "close" }`, which implicitly assigns `CmdOrCtrl+W` as the accelerator
- This accelerator triggers window-close instead of pane-close

**Root cause location:** `apps/desktop/src/main/lib/menu.ts:31` — implicit `CmdOrCtrl+W` accelerator on File menu's "Close Window" item.

## Binding scope (chosen: minimum)

### Acceptance criteria
- AC-1: Cmd+W pressed while focus is in a browser pane closes only that pane, not the entire window
- AC-2: Cmd+Shift+W still closes the entire tab (CLOSE_TAB behavior preserved)
- AC-3: Cmd+W pressed while focus is in terminal/other panes still closes the pane (no regression)
- AC-4: The File menu "Close Window" item remains visible but no longer captures Cmd+W
- AC-5: Browser pane close uses the same `useHotkey("CLOSE_PANE" | "CLOSE_TERMINAL", handler)` primitive that terminal/other panes use — webview interception routes into the existing hotkey flow rather than creating a parallel close mechanism

### Files in scope
- `apps/desktop/src/main/lib/menu.ts` — remove implicit `CmdOrCtrl+W` accelerator from the File menu close item (line 31: replace `role: "close"` with explicit click handler or set `accelerator` to empty)
- `apps/desktop/src/main/lib/browser/browser-manager.ts` — add `before-input-event` listener on registered webContents to intercept Cmd/Ctrl+W and emit a per-pane close event
- `apps/desktop/src/lib/trpc/routers/browser/browser.ts` — add `onClosePane` tRPC subscription following the existing `onNewWindow` / `onContextMenuAction` pattern
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts` (v1 variant) — subscribe to `onClosePane` and trigger the same close path as `useHotkey("CLOSE_TERMINAL")` (calls `requestPaneClose`)
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts` (v2 variant) — subscribe to `onClosePane` and trigger the same close path as `useHotkey("CLOSE_PANE")` (calls `closePane`)

### Colocation principle (binding constraint)
Webview panes and non-webview panes must use the **same hotkey primitives**. The difference is only in *how the keystroke is captured*:
- **Non-webview panes:** DOM keyboard event → `react-hotkeys-hook` → `useHotkey("CLOSE_PANE", handler)` → close pane
- **Webview panes:** Main-process `before-input-event` → tRPC event → `usePersistentWebview` subscription → calls the **same close function** that the `useHotkey` handler would call (`requestPaneClose` / `closePane`)

The interception source differs (DOM vs main-process IPC), but the close action is identical. This ensures:
1. Future hotkey changes (remapping, disabling) apply to both pane types uniformly
2. Webview-specific close logic doesn't drift from the standard close logic
3. The pattern is reusable for any future hotkeys that webviews need to support

### Out of scope (deliberately deferred)
- Removing the "Close Window" menu item (it stays, just without the accelerator)
- Modifying the Window menu's close accelerator (already Cmd+Shift+Q, unchanged)
- Changes to renderer hotkey registration infrastructure (`registry.ts`)
- Auditing other menu role-based accelerators for webview safety
- New IPC hotkey router abstraction
- See `.spec/improvements/SUPER-794/follow-ups.md` for deferred items

### Risks
- Menu accelerator removal affects all panes globally — must verify terminal/other panes still close correctly via renderer hotkeys
- `before-input-event` listener must be re-attached on webContents reparenting — browser-manager already re-calls `register()` on webContentsId change, so listener attachment in `register()` is correct
- V1 and V2 workspaces use different close APIs (`requestPaneClose` vs `closePane`) — tRPC event is generic; each workspace version's `usePersistentWebview` subscribes and calls its own close API

## Considered alternatives
- **moderate** — Minimum + audit all close accelerators + document accelerator ownership in `registry.ts`. Rejected because the `registry.ts` changes are "while-I'm-here" documentation work unrelated to the root cause.
- **strategic** — Minimum + new IPC hotkey router (`hotkey-router.ts`) for all webview-aware operations. Rejected because it's sprint-sized architectural work, not a bug fix.
- **challenger-smaller** — Just remove the implicit accelerator (1 file, ~5 LOC). Accept Cmd+W as no-op in webviews. Rejected because the user explicitly wants Cmd+W to close the browser pane — webviews should be treated as first-class panes with full hotkey support.
- **Remove "Close Window" menu item entirely** — Rejected because users expect a menu affordance for window close.
- **Add Cmd+W handler in webview preload script** — Rejected because preload scripts run in guest context and cannot close panes in host renderer.

## Challenger notes
- Reproduction evidence verified: all file:line references confirmed accurate
- Minimum option proves symptom fix: the causal chain (remove accelerator → intercept at webview → tRPC event → renderer close) is correct
- Path correction: tRPC browser router is at `src/lib/trpc/routers/browser/browser.ts`, not `src/main/lib/trpc/routers/browser.ts`
- Scope creep flagged in moderate/strategic options (confirmed by user choice of minimum)
- Challenger's smaller option (no-op in webviews) considered but rejected by user — webviews should have full hotkey parity

## Security review
Not required — no auth/secrets/tokens/RBAC touched.

## Scope amendments
None.

## Deferred follow-ups
See `.spec/improvements/SUPER-794/follow-ups.md`
