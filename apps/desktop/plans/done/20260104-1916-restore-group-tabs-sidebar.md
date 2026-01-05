# Restore Group Tabs to Sidebar with Configurable Position

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

PR #586 accidentally moved tab groups (the "Group 1", "Group 2" tabs that organize terminals/panes within a workspace) from their original location in the left sidebar to a horizontal strip in the content header. This is a breaking change from the behavior on the `main` branch.

After this change:
- **Default behavior** matches `main`: tab groups appear in the left sidebar via `ModeCarousel` + `TabsView`
- **New option**: users can choose to display groups in the content header (horizontal `GroupStrip`) via Settings
- The Workbench/Review mode toggle continues to work correctly with either setting

To verify: Open Settings → Behavior → "Group tabs position" dropdown. Switching between "Sidebar" and "Content header" immediately changes where groups are displayed.

## Assumptions

1. The `ModeCarousel` and `TabsView` components still exist on the `main` branch and can be restored via git checkout
2. The existing `navigationStyle` setting pattern is the correct template to follow
3. Feature parity between `TabsView` (sidebar) and `GroupStrip` (header) is NOT required - they can have different capabilities (TabsView has rename/reorder/presets; GroupStrip is a compact switcher)
4. Review mode must always show the changes/files view regardless of group tabs position setting
5. The current Sidebar passes `onFileOpen` to `ChangesView` for FileViewerPane integration - this must be preserved

## Open Questions

None - all questions resolved during planning phase.

## Progress

- [x] Milestone 1: Database schema and tRPC procedures
- [x] Milestone 2: Restore sidebar components from main (if missing) — SKIPPED (components already existed)
- [x] Milestone 3: Conditional rendering logic
- [x] Milestone 4: Settings UI
- [x] Milestone 5: Validation and QA

## Surprises & Discoveries

- `TabsView` and `ModeCarousel` directories already existed in the branch, so Milestone 2 was skipped
- The `generate` script in local-db is just `generate`, not `db:generate` as originally documented in plan
- Biome auto-fixed one formatting issue in BehaviorSettings.tsx (long line wrapping)

## Decision Log

- Decision: Default to "sidebar" position
  Rationale: Matches existing behavior on main branch, minimizes breaking change
  Date/Author: 2026-01-04 / User

- Decision: Feature parity NOT required between TabsView and GroupStrip
  Rationale: They serve different UX needs; TabsView has rename/reorder/presets, GroupStrip is compact switcher. Settings UI should clarify this tradeoff.
  Date/Author: 2026-01-04 / Planning

- Decision: Review mode always shows ChangesView regardless of setting
  Rationale: Review mode requires file list to function; showing tabs would break UX
  Date/Author: 2026-01-04 / Oracle review

- Decision: Use drizzle-kit generate for migration (not hand-create SQL)
  Rationale: Desktop app migrator requires `drizzle/meta/_journal.json` to be updated; hand-created SQL won't run
  Date/Author: 2026-01-04 / Oracle review

## Outcomes & Retrospective

**Completion Date**: 2026-01-04

**Summary**: Successfully implemented configurable group tabs position with default "sidebar" to match main branch behavior. The feature:
- Adds new `groupTabsPosition` setting with options: "sidebar" (default) or "content-header"
- Restores ModeCarousel + TabsView in sidebar when position is "sidebar"
- Shows GroupStrip in content header when position is "content-header"
- Properly handles Review mode (always shows ChangesView, never tabs)
- Includes Settings UI with description of feature differences between modes

**Files Changed**:
- `packages/local-db/src/schema/schema.ts` - Added GroupTabsPosition type and column
- `packages/local-db/drizzle/0008_add_group_tabs_position.sql` - Migration (generated)
- `apps/desktop/src/shared/constants.ts` - Added DEFAULT_GROUP_TABS_POSITION
- `apps/desktop/src/lib/trpc/routers/settings/index.ts` - Added getter/setter procedures
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/index.tsx` - Conditional ModeCarousel rendering
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/index.tsx` - Conditional GroupStrip rendering
- `apps/desktop/src/renderer/screens/main/components/SettingsView/BehaviorSettings.tsx` - Settings dropdown

**What Went Well**:
- Oracle review caught critical issues upfront (migration workflow, viewMode handling)
- Existing patterns (navigationStyle) provided clear template to follow
- Components already existed, reducing scope

**What Could Be Improved**:
- Plan's script name was wrong (`db:generate` vs `generate`) - should verify commands before documenting

## Context and Orientation

### Apps and Packages Affected
- **App**: `apps/desktop` (Electron desktop application)
- **Packages**: `packages/local-db` (SQLite schema and migrations)

### Key Concepts

**ModeCarousel**: A swipeable carousel component in the left sidebar that switches between different views. On `main`, it has two modes: "Tabs" (showing tab groups) and "Changes" (showing git changes/files).

**TabsView**: The component rendered when ModeCarousel is in "Tabs" mode. Shows a vertical list of tab groups with features like rename, drag-and-drop reorder, and terminal presets.

**GroupStrip**: A new horizontal component added in PR #586 that shows tab groups in the content header area. More compact but fewer features than TabsView.

**viewMode**: The Workbench/Review toggle state. "workbench" shows the mosaic panes layout; "review" shows the dedicated changes page.

**onFileOpen**: A callback prop passed to `ChangesView` that opens files in `FileViewerPane` when in workbench mode. Must be preserved in all Sidebar rendering paths.

### Current State (PR #586 branch)

The sidebar (`apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/index.tsx`) no longer uses `ModeCarousel`. It renders `ChangesView` with `onFileOpen` prop for workbench mode integration.

The `ContentView` (`apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/index.tsx`) renders `GroupStrip` in a `ContentHeader` wrapper. It passes `workspaceId` and `worktreePath` to `WorkspaceControls`.

### Target State (after this plan)

The sidebar conditionally renders based on BOTH `viewMode` AND `groupTabsPosition`:
1. **Review mode (any position)**: Always show `ChangesView` only
2. **Workbench + content-header**: Show `ChangesView` with `onFileOpen`
3. **Workbench + sidebar**: Show `ModeCarousel` with Tabs/Changes modes

The `ContentView` conditionally renders:
1. **Review mode**: No `ContentHeader` with GroupStrip
2. **Workbench + content-header**: `ContentHeader` with `GroupStrip`
3. **Workbench + sidebar + top-bar nav**: No `ContentHeader` (avoid empty header)
4. **Workbench + sidebar + sidebar nav**: `ContentHeader` with controls only (no GroupStrip)

### File Inventory

Files to create:
- Migration file (generated by drizzle-kit, name TBD like `0008_add_group_tabs_position.sql`)

Files to modify:
- `packages/local-db/src/schema/schema.ts`
- `apps/desktop/src/shared/constants.ts`
- `apps/desktop/src/lib/trpc/routers/settings/index.ts`
- `apps/desktop/src/renderer/screens/main/components/SettingsView/BehaviorSettings.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/index.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/index.tsx`

Files to restore from `main` (only if missing/different):
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/TabsView/` (entire directory)
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ModeCarousel/` (entire directory)

## Plan of Work

### Milestone 1: Database Schema and tRPC Procedures

Add the new setting to the database schema and expose it via tRPC.

**Step 1.1: Add type to schema**

In `packages/local-db/src/schema/schema.ts`, add after the `NavigationStyle` type:

```typescript
export type GroupTabsPosition = "sidebar" | "content-header";
```

In the same file, add to the `settings` table definition:

```typescript
groupTabsPosition: text("group_tabs_position").$type<GroupTabsPosition>(),
```

**Step 1.2: Generate migration with drizzle-kit**

IMPORTANT: Do NOT hand-create the migration file. The desktop app's migrator requires `drizzle/meta/_journal.json` to be updated.

```bash
cd packages/local-db
bun run db:generate --name add_group_tabs_position
```

This will:
- Create `drizzle/XXXX_add_group_tabs_position.sql` with the ALTER TABLE statement
- Update `drizzle/meta/_journal.json` with the new migration entry
- Update `drizzle/meta/XXXX_snapshot.json` with the new schema snapshot

Verify the generated SQL contains:
```sql
ALTER TABLE settings ADD COLUMN group_tabs_position TEXT;
```

**Step 1.3: Add default constant**

In `apps/desktop/src/shared/constants.ts`, add:

```typescript
export const DEFAULT_GROUP_TABS_POSITION = "sidebar" as const;
```

**Step 1.4: Add tRPC procedures**

In `apps/desktop/src/lib/trpc/routers/settings/index.ts`:

Add import at top:
```typescript
import { DEFAULT_GROUP_TABS_POSITION } from "shared/constants";
```

Note: Use `shared/constants` NOT `@shared/constants` (the @ alias doesn't exist in this codebase).

Add getter and setter following the `navigationStyle` pattern:

```typescript
getGroupTabsPosition: publicProcedure.query(() => {
  const row = getSettings();
  return row.groupTabsPosition ?? DEFAULT_GROUP_TABS_POSITION;
}),

setGroupTabsPosition: publicProcedure
  .input(z.object({ position: z.enum(["sidebar", "content-header"]) }))
  .mutation(({ input }) => {
    localDb
      .insert(settings)
      .values({ id: 1, groupTabsPosition: input.position })
      .onConflictDoUpdate({
        target: settings.id,
        set: { groupTabsPosition: input.position },
      })
      .run();

    return { success: true };
  }),
```

### Milestone 2: Restore Sidebar Components from Main (if needed)

Check if `TabsView` and `ModeCarousel` exist in the current branch. If missing or different from main, restore them.

**Step 2.1: Check if restoration is needed**

```bash
cd /Users/andreasasprou/.superset/worktrees/superset/workspacesidebar

# Check if TabsView exists
ls apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/TabsView/ 2>/dev/null || echo "TabsView MISSING - needs restore"

# Check if ModeCarousel exists
ls apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ModeCarousel/ 2>/dev/null || echo "ModeCarousel MISSING - needs restore"
```

**Step 2.2: Restore TabsView directory (if missing)**

```bash
git checkout main -- apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/TabsView/
```

This restores:
- `TabsView/index.tsx` - Main component
- `TabsView/TabItem.tsx` - Individual tab item
- `TabsView/PortsList.tsx` - Port forwarding list
- `TabsView/PresetContextMenu.tsx` - Terminal presets menu
- `TabsView/TabsCommandDialog.tsx` - Command palette for tabs

**Step 2.3: Restore ModeCarousel directory (if missing)**

```bash
git checkout main -- apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ModeCarousel/
```

This restores:
- `ModeCarousel/index.tsx` - Main carousel component
- `ModeCarousel/ModeHeader.tsx` - Header for each mode
- `ModeCarousel/ModeContent.tsx` - Content wrapper
- `ModeCarousel/ModeNavigation.tsx` - Navigation dots
- `ModeCarousel/types.ts` - Type definitions
- `ModeCarousel/hooks/` - Custom hooks for carousel behavior

**Step 2.4: Verify restoration and check for API drift**

After restoration, run typecheck to catch any import/API mismatches:

```bash
bun run typecheck --filter=@superset/desktop
```

If there are errors, they indicate API drift that must be resolved before proceeding.

### Milestone 3: Conditional Rendering Logic

Update the Sidebar and ContentView to conditionally render based on the setting AND viewMode.

**Step 3.1: Update Sidebar**

Read the current `apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/index.tsx` first to understand existing props and structure.

The updated Sidebar must:
1. Check `viewMode` FIRST - Review mode always shows ChangesView only
2. Preserve `onFileOpen` prop passing to `ChangesView`
3. Conditionally show ModeCarousel vs ChangesView based on `groupTabsPosition`

```typescript
import { trpc } from "renderer/lib/trpc";
import { DEFAULT_GROUP_TABS_POSITION } from "shared/constants";
import { SidebarMode, useSidebarStore } from "renderer/stores";
import { useViewModeStore } from "renderer/stores/workspace-view-mode";
import { ChangesView } from "./ChangesView";
import { ModeCarousel } from "./ModeCarousel";
import { TabsView } from "./TabsView";

interface SidebarProps {
  onFileOpen?: (filePath: string, options?: { line?: number; column?: number }) => void;
}

export function Sidebar({ onFileOpen }: SidebarProps) {
  const { data: groupTabsPosition } = trpc.settings.getGroupTabsPosition.useQuery();
  const effectivePosition = groupTabsPosition ?? DEFAULT_GROUP_TABS_POSITION;

  const viewMode = useViewModeStore((s) => s.viewMode);
  const { currentMode, setMode } = useSidebarStore();

  // CRITICAL: Review mode ALWAYS shows ChangesView only, regardless of setting
  // This ensures the file list is always available for review
  if (viewMode === "review") {
    return (
      <aside className="h-full flex flex-col overflow-hidden">
        <ChangesView />
      </aside>
    );
  }

  // Workbench mode with groups in content header: only show ChangesView
  if (effectivePosition === "content-header") {
    return (
      <aside className="h-full flex flex-col overflow-hidden">
        <ChangesView onFileOpen={onFileOpen} />
      </aside>
    );
  }

  // Workbench mode with groups in sidebar: show ModeCarousel with Tabs/Changes
  const modes: SidebarMode[] = [SidebarMode.Tabs, SidebarMode.Changes];

  return (
    <aside className="h-full flex flex-col overflow-hidden">
      <ModeCarousel
        modes={modes}
        currentMode={currentMode}
        onModeSelect={setMode}
      >
        {(mode) => {
          if (mode === SidebarMode.Changes) {
            return <ChangesView onFileOpen={onFileOpen} />;
          }
          return <TabsView />;
        }}
      </ModeCarousel>
    </aside>
  );
}
```

**Step 3.2: Update ContentView**

Read the current `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/index.tsx` first to understand existing structure and props.

Key changes:
1. Add query for `groupTabsPosition`
2. Only show GroupStrip when `viewMode === "workbench"` AND `groupTabsPosition === "content-header"`
3. Only render ContentHeader when needed (avoid empty header in top-bar mode with sidebar groups)
4. Preserve existing props to WorkspaceControls (`workspaceId`, `worktreePath`)

The logic for whether to show ContentHeader:

```typescript
const { data: groupTabsPosition } = trpc.settings.getGroupTabsPosition.useQuery();
const effectivePosition = groupTabsPosition ?? DEFAULT_GROUP_TABS_POSITION;

// Show GroupStrip only in workbench mode with content-header position
const showGroupStrip = viewMode === "workbench" && effectivePosition === "content-header";

// Show ContentHeader if:
// 1. In sidebar navigation mode (needs SidebarControl and WorkspaceControls), OR
// 2. GroupStrip should be shown
const showContentHeader = isSidebarMode || showGroupStrip;
```

In the JSX:

```typescript
{showContentHeader && (
  <ContentHeader
    leadingAction={isSidebarMode ? <SidebarControl /> : undefined}
    trailingAction={
      isSidebarMode ? (
        <WorkspaceControls workspaceId={workspaceId} worktreePath={worktreePath} />
      ) : undefined
    }
  >
    {showGroupStrip ? <GroupStrip /> : <div />}
  </ContentHeader>
)}
```

### Milestone 4: Settings UI

Add the dropdown to the Behavior settings page.

**Step 4.1: Update BehaviorSettings**

In `apps/desktop/src/renderer/screens/main/components/SettingsView/BehaviorSettings.tsx`:

Add import:
```typescript
import { DEFAULT_GROUP_TABS_POSITION } from "shared/constants";
```

Add the query and mutation (following existing patterns):

```typescript
const { data: groupTabsPosition, isLoading: isGroupTabsLoading } =
  trpc.settings.getGroupTabsPosition.useQuery();

const setGroupTabsPositionMutation = trpc.settings.setGroupTabsPosition.useMutation({
  onMutate: async ({ position }) => {
    await utils.settings.getGroupTabsPosition.cancel();
    const previous = utils.settings.getGroupTabsPosition.getData();
    utils.settings.getGroupTabsPosition.setData(undefined, position);
    return { previous };
  },
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      utils.settings.getGroupTabsPosition.setData(undefined, context.previous);
    }
  },
  onSettled: () => {
    utils.settings.getGroupTabsPosition.invalidate();
  },
});
```

Add the Select component in the JSX (after the Navigation style select):

```tsx
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="group-tabs-position">Group tabs position</Label>
    <p className="text-sm text-muted-foreground">
      Where to display terminal group tabs. Sidebar includes rename, reorder, and presets; header is compact.
    </p>
  </div>
  <Select
    value={groupTabsPosition ?? DEFAULT_GROUP_TABS_POSITION}
    onValueChange={(value) =>
      setGroupTabsPositionMutation.mutate({
        position: value as "sidebar" | "content-header",
      })
    }
    disabled={isGroupTabsLoading || setGroupTabsPositionMutation.isPending}
  >
    <SelectTrigger className="w-[180px]" id="group-tabs-position">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="sidebar">Sidebar</SelectItem>
      <SelectItem value="content-header">Content header</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Note: Disable the select during BOTH loading AND mutation pending states.

### Milestone 5: Validation and QA

Run all validation commands and test the feature matrix.

## Concrete Steps

### After Milestone 1:

```bash
cd /Users/andreasasprou/.superset/worktrees/superset/workspacesidebar

# Verify migration was generated
ls packages/local-db/drizzle/*.sql | tail -1
# Expected: Shows the new migration file

# Check journal was updated
cat packages/local-db/drizzle/meta/_journal.json | tail -20
# Expected: Shows entry for new migration

# Typecheck local-db
bun run typecheck --filter=@superset/local-db
# Expected: No errors
```

### After Milestone 2:

```bash
cd /Users/andreasasprou/.superset/worktrees/superset/workspacesidebar

# Verify directories exist
ls -la apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/TabsView/
ls -la apps/desktop/src/renderer/screens/main/components/WorkspaceView/Sidebar/ModeCarousel/
# Expected: Both directories exist with their files

# Check for API drift
bun run typecheck --filter=@superset/desktop
# Expected: No errors (or document any that need fixing)
```

### After Milestone 4:

```bash
cd /Users/andreasasprou/.superset/worktrees/superset/workspacesidebar

bun run typecheck
# Expected: No type errors

bun run lint:fix
# Expected: Fixes applied, no remaining errors
```

### Final Validation:

```bash
cd /Users/andreasasprou/.superset/worktrees/superset/workspacesidebar
bun dev
# Expected: Desktop app opens
```

## Validation and Acceptance

### QA Test Matrix

Test all combinations:

| navigationStyle | groupTabsPosition | viewMode | Expected Behavior |
|----------------|-------------------|----------|-------------------|
| top-bar | sidebar | workbench | Groups in left sidebar via ModeCarousel, no ContentHeader |
| top-bar | sidebar | review | ChangesView only (no ModeCarousel, no group tabs) |
| top-bar | content-header | workbench | GroupStrip in content header |
| top-bar | content-header | review | No GroupStrip, no ContentHeader |
| sidebar | sidebar | workbench | Groups in left sidebar via ModeCarousel, ContentHeader with controls |
| sidebar | sidebar | review | ChangesView only, ContentHeader with controls |
| sidebar | content-header | workbench | GroupStrip in content header, ContentHeader with controls |
| sidebar | content-header | review | No GroupStrip, ContentHeader with controls only |

### Additional QA Checks

**Upgrade existing DB:**
1. Start app with existing database (has settings but no group_tabs_position column)
2. Migration should run automatically
3. Setting should default to "sidebar"
4. No crash on startup

**GroupStrip functional checks (when in content-header mode):**
1. Click group tab to switch
2. Click + to add new group
3. Click × to close group
4. Verify groups persist after restart

**TabsView functional checks (when in sidebar mode):**
1. Double-click tab to rename
2. Drag tab to reorder
3. Right-click for context menu
4. Terminal presets work

### Acceptance Criteria

1. Settings → Behavior shows "Group tabs position" dropdown
2. Default is "Sidebar" (matching main branch behavior)
3. Changing setting immediately updates UI (no restart needed)
4. Setting persists after app restart
5. In Review mode, groups are NEVER shown (regardless of setting)
6. ModeCarousel swipe gesture works when groups are in sidebar
7. TabsView features work: rename tab, drag reorder, terminal presets
8. Existing databases upgrade without crash
9. `onFileOpen` continues to work in workbench mode (files open in FileViewerPane)

## Idempotence and Recovery

All steps are idempotent:
- Schema changes use `onConflictDoUpdate` pattern
- Git checkout commands can be re-run safely
- drizzle-kit generate can be re-run (will no-op if already done)

If something goes wrong:
- **Database (dev)**: Delete `~/.superset-dev/local.db` to reset (loses local settings)
- **Database (prod)**: Delete `~/.superset/local.db` to reset
- **Git**: `git checkout -- <file>` to restore any file to branch state
- **Migration issues**: Check `packages/local-db/drizzle/meta/_journal.json` is updated

## Interfaces and Dependencies

### New tRPC Procedures

```typescript
// In apps/desktop/src/lib/trpc/routers/settings/index.ts

getGroupTabsPosition: publicProcedure.query(() => GroupTabsPosition)

setGroupTabsPosition: publicProcedure
  .input(z.object({ position: z.enum(["sidebar", "content-header"]) }))
  .mutation(() => { success: boolean })
```

### New Types

```typescript
// In packages/local-db/src/schema/schema.ts
export type GroupTabsPosition = "sidebar" | "content-header";
```

### New Constants

```typescript
// In apps/desktop/src/shared/constants.ts
export const DEFAULT_GROUP_TABS_POSITION = "sidebar" as const;
```

### Existing Dependencies Used

- `useViewModeStore` from `renderer/stores/workspace-view-mode` - for checking workbench vs review
- `useSidebarStore` from `renderer/stores/sidebar-state` - for ModeCarousel state
- `SidebarMode` enum from `renderer/stores` - Tabs and Changes modes

## Artifacts and Notes

### Oracle Review Findings (incorporated into plan)

1. **Migration workflow**: Must use `bun run db:generate` not hand-create SQL - migrator requires `_journal.json`
2. **Review mode enforcement**: Both Sidebar AND ContentView must check viewMode - tabs never in review
3. **Preserve onFileOpen**: Sidebar passes this to ChangesView for FileViewerPane integration
4. **ContentHeader conditional**: Don't show empty header in top-bar mode with sidebar groups
5. **WorkspaceControls props**: Must pass `workspaceId` and `worktreePath`
6. **Import path**: Use `shared/constants` not `@shared/constants`
7. **Select disabled state**: Disable during loading AND mutation pending
8. **Dev database path**: `~/.superset-dev/local.db` not `~/.superset/local.db`

---

## Revision History

- 2026-01-04 19:16 - Initial plan created
- 2026-01-04 19:45 - Updated with Oracle review feedback:
  - Fixed migration workflow to use drizzle-kit generate
  - Added viewMode check to Sidebar (review mode handling)
  - Preserved onFileOpen prop in Sidebar
  - Fixed ContentView to conditionally show ContentHeader
  - Fixed import path (shared/constants not @shared/constants)
  - Added check before restoring components in Milestone 2
  - Fixed database path in recovery section
  - Enhanced QA with upgrade and functional checks
  - Added mutation pending check to Select disabled state
