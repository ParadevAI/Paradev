import { SidebarNewWorkspaceButton } from "../SidebarNewWorkspaceButton";
import { SidebarSearchButton } from "../SidebarSearchButton";

/** The list panel's header in the redesigned shell, where the rail holds navigation. */
export function DashboardSidebarShellHeader() {
	return (
		<div className="flex flex-col gap-px px-2 pt-2 pb-2">
			<SidebarNewWorkspaceButton />
			<SidebarSearchButton />
		</div>
	);
}
