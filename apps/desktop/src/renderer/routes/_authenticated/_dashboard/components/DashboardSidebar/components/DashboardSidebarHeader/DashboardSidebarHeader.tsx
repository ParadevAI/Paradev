import { Trans } from "@lingui/react/macro";
import { useMatchRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { LuPlus, LuSearch } from "react-icons/lu";
import { useFrameStackStore } from "renderer/commandPalette";
import { SidebarKbdHint } from "renderer/components/SidebarKbdHint";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";

export function DashboardSidebarHeader() {
	const openNewWorkspace = useOpenNewWorkspace();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	const searchShortcutText = useHotkeyDisplay("OPEN_COMMAND_PALETTE").text;
	const openCommandPalette = useFrameStackStore((s) => s.setOpen);
	// The palette dialog dismisses on outside pointerdown before our click fires,
	// so a live-state toggle would always reopen it. Capture the state at
	// pointerdown to make clicking the button close an open palette.
	const paletteWasOpenRef = useRef(false);
	const handleSearchPointerDown = () => {
		paletteWasOpenRef.current = useFrameStackStore.getState().open;
	};
	const handleSearchClick = () => {
		openCommandPalette(!paletteWasOpenRef.current);
		paletteWasOpenRef.current = false;
	};
	const matchRoute = useMatchRoute();
	const v2WorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	// Pre-select the viewed workspace's project in the new-workspace screen.
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const activeProjectId =
		v2WorkspaceMatch !== false
			? (hostWorkspaces.find(
					(workspace) => workspace.id === v2WorkspaceMatch.workspaceId,
				)?.projectId ?? undefined)
			: undefined;

	return (
		<div className="flex flex-col gap-px px-2 pt-2 pb-2">
			<button
				type="button"
				onClick={() => openNewWorkspace(activeProjectId)}
				className="group flex h-7 w-full items-center gap-2 rounded-md bg-fill-hover/60 [.light_&]:bg-fill-hover px-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-selected [.light_&]:hover:bg-fill-selected hover:text-foreground"
			>
				<div className="flex size-5 shrink-0 items-center justify-center rounded bg-fill-selected">
					<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
				</div>
				<span className="flex-1 truncate text-left whitespace-nowrap">
					<Trans>New Workspace</Trans>
				</span>
				<SidebarKbdHint label={shortcutText} />
			</button>

			<button
				type="button"
				onPointerDown={handleSearchPointerDown}
				onClick={handleSearchClick}
				className="group flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
			>
				<LuSearch
					className="size-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<span className="flex-1 text-left">
					<Trans>Search</Trans>
				</span>
				{searchShortcutText !== "Unassigned" && (
					<SidebarKbdHint label={searchShortcutText} />
				)}
			</button>
		</div>
	);
}
