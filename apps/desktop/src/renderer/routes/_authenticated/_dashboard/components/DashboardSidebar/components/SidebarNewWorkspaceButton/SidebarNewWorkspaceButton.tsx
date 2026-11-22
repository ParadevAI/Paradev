import { Trans } from "@lingui/react/macro";
import { LuPlus } from "react-icons/lu";
import { SidebarKbdHint } from "renderer/components/SidebarKbdHint";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useOpenNewWorkspaceInViewedProject } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenNewWorkspaceInViewedProject";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";

export function SidebarNewWorkspaceButton() {
	const openNewWorkspace = useOpenNewWorkspaceInViewedProject();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	return (
		<button
			type="button"
			onClick={openNewWorkspace}
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
	);
}
