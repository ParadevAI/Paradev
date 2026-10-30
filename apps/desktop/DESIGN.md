# Paradev desktop - design system

The source of truth for how the desktop app looks. Each token names the file that defines it; a
value that is not in the code is not in this file. New UI uses these tokens and parts; a new token
or part is added here in the same change. Paths are relative to the repo root.

## Sources

| Source | What it owns |
| --- | --- |
| `packages/shared/src/themes/built-in/ember.ts` | Dark theme values (`DEFAULT_THEME_ID = "dark"`, `built-in/index.ts`) |
| `packages/shared/src/themes/built-in/light.ts` | Light theme values |
| `apps/desktop/src/renderer/stores/theme/utils/css-variables.ts` | Writes the theme values onto `:root` at runtime and sets `html.dark` or `html.light` |
| `apps/desktop/src/renderer/globals.css` | Pre-hydration fallback values, the `@theme inline` map to Tailwind, radius scale, `--fill-*` |
| `node_modules/.bun/tailwindcss@4.2.2/.../theme.css` | Tailwind defaults the app does not override: font stack, type scale, shadows, easing, durations |
| `packages/ui/src/motion.css` | App keyframes |
| `packages/ui/src/components/ui/*.tsx` | Shared parts (shadcn) |
| `packages/panes/src/react/components/Workspace/components/Tab/` | Pane frame, header, minimum size |

The runtime theme wins over the `globals.css` fallback. Where they differ, this file uses the
theme file and lists the difference under Inconsistencies.

## Color

Tailwind class = `bg-<token>`, `text-<token>`, `border-<token>` (mapped in `globals.css` `@theme inline`).

| Token | Dark (`ember.ts`) | Light (`light.ts`) | Role |
| --- | --- | --- | --- |
| `background` | `#151110` | `#f9f9fa` | Window and page surface |
| `foreground` | `#eae8e6` | `oklch(0.145 0 0)` | Primary text |
| `card` / `card-foreground` | `#201E1C` / `#eae8e6` | `oklch(0.97 0 0)` / `oklch(0.145 0 0)` | Cards |
| `popover` / `popover-foreground` | `#201E1C` / `#eae8e6` | `oklch(0.97 0 0)` / `oklch(0.145 0 0)` | Menus, popovers |
| `primary` / `primary-foreground` | `#eae8e6` / `#151110` | `oklch(0.205 0 0)` / `oklch(0.985 0 0)` | Primary action |
| `secondary` / `secondary-foreground` | `#2a2827` / `#eae8e6` | `oklch(0.97 0 0)` / `oklch(0.205 0 0)` | Secondary badge, button |
| `muted` | `#2a2827` | `oklch(0.97 0 0)` | Washes (used with `/30` to `/50`) |
| `muted-foreground` | `#a8a5a3` | `#4a4847` | Icons, secondary text |
| `accent` / `accent-foreground` | `#2a2827` / `#eae8e6` | `oklch(0.93 0 0)` / `oklch(0.205 0 0)` | Menu item focus, "Open in app" pill |
| `tertiary` / `tertiary-active` | `#1a1716` / `#252220` | `oklch(0.95 0.003 40)` / `oklch(0.90 0.003 40)` | Tertiary surfaces |
| `destructive` | `#cc4444` | `oklch(0.577 0.245 27.325)` | Destructive menu item, errors |
| `warning` | `#e5c07b` | `#906d00` | Warnings |
| `success` | `#00c950` | `#00c950` | Success |
| `border` / `input` | `#2a2827` | `oklch(0.922 0 0)` | Borders, inputs |
| `ring` | `#3a3837` | `oklch(0.708 0 0)` | Focus ring, URL field edit border (`border-ring/60`) |
| `sidebar` | `#1a1716` | `#ececec` | Sidebar surface |
| `sidebar-primary` | `#e07850` | `oklch(0.205 0 0)` | Sidebar accent |
| `highlight` / `highlight-foreground` | `#e07850` / `#151110` | `oklch(0.646 0.222 41.116)` / `oklch(0.985 0 0)` | Brand highlight |
| `chart-1` to `chart-5` | `#e07850` `#50a878` `#d4a84b` `#7b68ee` `#dc6b6b` | `oklch(0.646 0.222 41.116)` `oklch(0.6 0.118 184.704)` `oklch(0.398 0.07 227.392)` `oklch(0.828 0.189 84.429)` `oklch(0.769 0.188 70.08)` | Charts |
| `fill-hover` / `fill-selected` | foreground 7% / 10% | foreground 4% / 6% | Sidebar rows (`globals.css` only, not in themes) |

Opacity steps the browser toolbar uses (`BrowserToolbar.tsx`, `BrowserPaneToolbar.tsx`, `PaneHeader.tsx`):

| Use | Class |
| --- | --- |
| Pane header surface | `bg-muted/30`, bottom edge `border-border/20` |
| Toolbar icon, idle | `text-muted-foreground/70` |
| Toolbar icon, disabled | `text-muted-foreground/30` |
| Toolbar icon, hover fill | `bg-muted/50` |
| URL text / hover fill | `text-foreground/75` / `bg-muted/40` |
| URL placeholder | `text-muted-foreground/40` |
| Active pane border | `border-primary/15` |
| Pane header actions, idle | `text-muted-foreground/60` |

One raw color is allowed by an inline comment: design mode armed `#0d99ff` (`BrowserPaneToolbar.tsx`),
to match the in-page picker outline.

## Typography

| Token | Value | Source | Used for |
| --- | --- | --- | --- |
| `font-sans` | `ui-sans-serif, system-ui, sans-serif, ...` (SF Pro on macOS) | Tailwind `theme.css`, not overridden | All UI |
| terminal font | `var(--superset-terminal-font-family, ui-monospace, monospace)`; SF Mono loaded from `superset-font://` | `globals.css`, `styles/bundled-fonts.css` | Terminal |
| `text-sm` | 14 px / 20 px | Tailwind | Menu items, menu label |
| `text-xs` | 12 px / 16 px | Tailwind | URL bar, tooltip, menu shortcut |
| `text-[11px] font-medium leading-none` | 11 px / 1 | `BrowserPaneToolbar.tsx`, `OpenBrowserPageInAppButton` | Toolbar pill buttons |
| `text-[10px] uppercase tracking-wider` | 10 px | `badge.tsx` `box` variant | Box badge |
| `text-[7.5px] font-bold tabular-nums` | 7.5 px | `count-badge.tsx` | Count badge on an icon (`sm`: 6.5 px) |

Weights in use: 400, `font-medium` 500, `font-bold` 700. Counts use `tabular-nums`.

## Spacing and size

Tailwind 4 px step (`0.25rem`). No custom spacing scale.

| Token | Value | Source |
| --- | --- | --- |
| Pane minimum | `min-w-[260px] min-h-[160px]`, plus `border-2` | `packages/panes/.../Tab/constants.ts:1`, `Pane.tsx` |
| Pane header height | `h-7` (28 px) | `PaneHeader.tsx` |
| Toolbar control height | `h-[22px]` | `BrowserToolbar.tsx`, `BrowserPaneToolbar.tsx` |
| Toolbar icon button | `p-1` + `size-3.5` icon = 22 px square | `BrowserToolbar.tsx` |
| Toolbar insets | `px-2` left part, `pr-1.5` right part | `BrowserToolbar.tsx`, `BrowserPaneToolbar.tsx` |
| Toolbar gaps | `gap-0.5` nav group, `gap-1` right group, `gap-1.5` between URL and nav | same |
| Icons | `size-3.5` toolbar, `size-3` in pills, `size-4` menu default | same, `dropdown-menu.tsx` |
| Menu | `p-1`, items `px-2 py-1.5 gap-2`, `sideOffset 4` | `dropdown-menu.tsx` |
| Menu widths | `w-64` overflow menu and extensions submenu, `w-72` signed-in sites submenu | `BrowserOverflowMenu.tsx`, `BrowserExtensionsSubmenu.tsx`, `SignedInSitesSubmenu.tsx` |

Container queries: `@container/pane-header` on the pane root (`Pane.tsx`), `@container/browser-toolbar`
on the toolbar (`BrowserPaneToolbar.tsx`). Breakpoints in use: `@min-[360px]/pane-header` (Design
label) and `@min-[480px]/browser-toolbar` ("Open in app" label, pinned extension buttons).

## Radius

`--radius: 0.625rem` (`globals.css`). Scale from `@theme inline`:

| Class | Value | Used for |
| --- | --- | --- |
| `rounded` | 4 px (Tailwind inline default, not app scale) | Inline buttons inside menu rows, pane header actions |
| `rounded-sm` | `calc(var(--radius) - 4px)` = 6 px | Menu items, tooltip |
| `rounded-md` | `calc(var(--radius) - 2px)` = 8 px | Toolbar buttons, URL field |
| `rounded-lg` | `var(--radius)` = 10 px | Menu surface |
| `rounded-xl` | `calc(var(--radius) + 4px)` = 14 px | Larger cards |
| `rounded-full` | | Badges, dots |

## Elevation

Tailwind 4.2.2 defaults, not overridden.

| Class | Value | Used for |
| --- | --- | --- |
| `shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | Tooltip |
| `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Dropdown menu |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dropdown submenu |

Layer order: page `<webview>` is native and paints over the pane, so anything that must show over
the page portals into the registry overlay layer (`BrowserToolbar.tsx` comment, `browserRuntimeRegistry`).

## Motion

| Token | Value | Source |
| --- | --- | --- |
| `transition-colors` | 150 ms, `cubic-bezier(0.4, 0, 0.2, 1)` | Tailwind defaults |
| Pane border and header opacity | `duration-150` | `Pane.tsx`, `PaneHeader.tsx` |
| Menu open/close | `fade-in-0 zoom-in-95 slide-in-from-top-2` | `tw-animate-css` in `dropdown-menu.tsx` |
| Menu close wait before a dialog | 200 ms (`MENU_CLOSE_ANIMATION_MS`) | `BrowserOverflowMenu.tsx`, `useBrowserExtensionsMenu.ts` |
| Loading | `animate-spin` on `TbLoader2` | `BrowserToolbar.tsx` |
| `block-fade` | 320 ms `ease-out` | `motion.css` |
| `shimmer`, `spin-slow`, `thinking-pulse` | 2 s, 3.6 s, 1.8 s | `motion.css` |

## Patterns

**Toolbar icon button.** `rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground`,
icon `size-3.5`. Disabled: `text-muted-foreground/30 pointer-events-none`. It is a class string copied
into `BrowserToolbar.tsx` (3 times) and the `BrowserOverflowMenu` trigger. It is not a component.

**Toolbar pill button.** `flex h-[22px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none`,
icon `size-3`. Idle `text-muted-foreground hover:bg-muted/50`; filled `bg-accent text-accent-foreground`.
The label hides in a narrow pane by a container query.

**Pane header action.** `rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground`
(`PaneHeaderActions.tsx`). Icons `TbLayoutColumns`, `HiMiniXMark`.

**Menu.** `DropdownMenu` from `@superset/ui/dropdown-menu`. Content `bg-popover rounded-lg border p-1 shadow-md`.
Item `rounded-sm px-2 py-1.5 text-sm`, focus `bg-accent text-accent-foreground`. Label `px-2 py-1.5 text-sm font-medium`.
Separator `bg-border -mx-1 my-1 h-px`. Submenu `DropdownMenuSub` with a chevron trigger.

**Menu row with a trailing action.** `DropdownMenuItem className="justify-between gap-2"` with a
`tabIndex={-1}` icon button `shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground`;
the item's `onSelect` runs the action so the keyboard reaches it (`SignedInSitesSubmenu.tsx`).

**Count badge on an icon.** `CountBadge` from `@superset/ui/count-badge`: a pill pinned to the icon's
top-right corner, `bg-muted-foreground text-background`, 11 px tall (`sm` 10 px), grows with up to 4
characters. The parent is `relative`; the caller sets the ring to the surface color. An extension's
own badge color overrides the background, with `text-white` or `text-black`, whichever has more WCAG
contrast (`badgeTextTone`). Used by `PortsCountIcon` and the browser pane's extension buttons
(`ExtensionToolbarButton`).

**Extension toolbar button.** The toolbar icon button with the extension's 32 px icon at `size-3.5`
and a `CountBadge` ringed in the header surface. While its popup is open: `bg-accent text-accent-foreground`
and `ring-accent`. Below the 480 px breakpoint the pinned buttons become the first rows of More, with
the badge as an outline `Badge` (`PinnedExtensionRows`).

**Tooltip.** `@superset/ui/tooltip`, `bg-background border rounded-sm px-1.5 py-0.5 text-xs shadow-sm`.

**Icons.** Browser toolbar: Tabler (`react-icons/tb`). Menus: lucide. Pane close: Heroicons mini.

## Inconsistencies found

1. Light fallback in `globals.css` sets `--popover: oklch(1 0 0)` and `--accent: oklch(0.97 0 0)`.
   `light.ts` sets `popover: oklch(0.97 0 0)` and `accent: oklch(0.93 0 0)`. Dark fallback
   `--success: #5fb37f`, `ember.ts` `#00c950`. Light fallback `--warning: oklch(0.554 0.113 86.265)`,
   `light.ts` `#906d00`. The app flashes the fallback before hydration.
2. Toolbar icon buttons fill on hover (`hover:bg-muted/50`). Pane header actions in the same row do
   not (`hover:text-muted-foreground` only).
3. A puzzle icon already means agent plugins: `PluginIcon.tsx` falls back to `LuPuzzle`, settings
   uses `HiOutlinePuzzlePiece`.
4. Three icon sets in one toolbar row: Tabler, lucide (`SquareDashedMousePointer`, `GlobeIcon`), Heroicons.
