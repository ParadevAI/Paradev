---
name: panes
description: Arrange the tabs and split panes of a Superset workspace in the desktop app from an agent. Use when the user asks to split a pane, open a tab, run a command in a new pane, resize, swap, move, focus, close, or even out panes, lay out a dashboard of terminals, or show them something side by side, including "split this and run the tests on the right", "open the logs in a new tab", "make this pane bigger", "put the server and the tests side by side", "close those extra panes". Not for coordinating worker agents (use superset:orchestrate) or driving web pages (use superset:browser).
argument-hint: the layout to build, or the pane change to make
allowed-tools: Bash(superset:*) Bash(jq:*)
---

# Superset Pane Layout

Script the tabs and split panes of a workspace with `superset panes`. Commands go
to the host, then to the desktop app, which applies them to the live layout the
user is looking at. Every change is visible immediately, so build layouts the
user asked for and clean up what you open.

## Establish the control surface

1. Run `superset schema 2>/dev/null | jq -re '.commands[] | select(.path==["panes"]) | .commands[].path[1]' || superset panes --help`
   and require `list`, `split`, `new-tab`, `resize`, `equalize`, `move`, `swap`,
   `focus`, and `close`. `panes` is new in CLI 1.38.0. If it is missing, run
   `superset update` and recheck. The app-bundled CLI (`~/.superset/bin/superset`)
   updates only with the desktop app, so if it still lacks `panes`, updating
   the app is the fix.
2. Resolve the workspace. Inside a workspace, use `$SUPERSET_WORKSPACE_ID`;
   otherwise `superset workspaces list --local --json` and pick the target.
3. Panes live in the desktop app. A host with no desktop attached (a standalone
   `superset start`) has no panes, and an older desktop app answers "This host
   is too old for `superset panes`". Surface either rather than retrying.

## Read the layout

```bash
superset panes list --workspace "$WS" --json
```

The result has `activeTabId` and `tabs[]`. Each tab has `layout`, a split tree
of `{ type: "split", direction, ratio, first, second }` and
`{ type: "pane", paneId }` nodes, plus a flat `panes[]` with each pane's `kind`
(`terminal`, `chat-v3`, `browser`, …), `terminalId`, `active`, and the `agent`
running in it with its state. `row` splits sit side by side and `column` splits
stack; `ratio` is the first child's share.

Inside a workspace, the pane you are running in is the one whose `terminalId`
equals `$SUPERSET_TERMINAL_ID`:

```bash
ME=$(superset panes list --workspace "$WS" --json \
  | jq -r --arg t "$SUPERSET_TERMINAL_ID" '.tabs[].panes[] | select(.terminalId==$t) | .id')
```

## Change the layout

Every mutating command returns the new pane or tab ID plus the full updated
layout, so chain commands from its output instead of listing again. Read IDs
with `--json | jq -r .paneId` (or `.tabId`, `.terminalId`); `--quiet` does not
reduce these results to an ID.

| Goal | Command |
|:-----|:--------|
| Split a pane, new terminal in the new half | `panes split --workspace $WS --pane P --direction right\|left\|down\|up [--command CMD]` |
| Open a tab with a terminal | `panes new-tab --workspace $WS [--command CMD]` |
| Show an existing terminal instead | add `--terminal <terminal-id>` to `split` or `new-tab` (not with `--command`) |
| Set a pane's share of its split | `panes resize --workspace $WS --pane P --ratio 0.05–0.95` |
| Even out every split | `panes equalize --workspace $WS [--tab T]` |
| Exchange two panes, even across tabs | `panes swap --workspace $WS --pane A --with B` |
| Move a pane beside another | `panes move --workspace $WS --pane P --to Q --direction right\|left\|down\|up` |
| Move a pane into a tab of its own | `panes move --workspace $WS --pane P --new-tab` |
| Bring a pane and its tab to the front | `panes focus --workspace $WS --pane P` |
| Close a pane | `panes close --workspace $WS --pane P [--keep-terminal]` |

Behavior to rely on:

- Only `focus` moves focus. `split` and `new-tab` add panes without taking the
  user away from what they are looking at; follow with `focus` only when the
  user should see the new pane now.
- `--command` types the command into the new terminal's shell. When it exits,
  its output stays on screen above a prompt, so one-shot commands need no
  wrapping. A display that should keep refreshing needs its own loop
  (`while true; do clear; …; sleep 2; done`).
- `close` ends the pane's terminal, as the close button in the app does. Pass
  `--keep-terminal` to keep a long-running process alive in the background and
  reattach it later with `--terminal`.
- `move` closes a tab it leaves empty.
- A split always halves the pane it splits. Splitting one pane repeatedly gives
  50/25/12.5 shares; build the tree, then `equalize` once.
- If the desktop app does not confirm a `split` or `new-tab` in time, the CLI
  keeps the terminal it created and says so. Check `panes list` before retrying,
  or the retry opens a second pane.

## Read what a pane shows

`superset terminals read --local --workspace $WS --terminal <terminal-id> --json`
returns the screen text of a terminal pane, which confirms a command started
and shows its output. Pass `--local` (or `--host <id>`); without it the CLI
looks for a cloud workspace.

## Layout recipes

Side by side with the user's pane, tests on the right, a watcher below them:

```bash
WS=$SUPERSET_WORKSPACE_ID
R=$(superset panes split --workspace $WS --pane "$ME" --direction right --command 'npm test -- --watch' --json)
TESTS=$(jq -r .paneId <<<"$R")
superset panes split --workspace $WS --pane "$TESTS" --direction down --command 'npm run dev' --json >/dev/null
superset panes resize --workspace $WS --pane "$ME" --ratio 0.6 --json >/dev/null
```

A grid of N panes in a new tab: open the tab, split the first pane right for
each column, split each column down for each row, then `equalize --tab`.

## Clean up

Panes you open stay open, and their terminals keep running. When the work is
done, or before rebuilding a layout, close what you created: track the pane IDs
you made and `panes close` each one. Do not close panes you did not create
unless the user asks, and never close the pane you are running in.
