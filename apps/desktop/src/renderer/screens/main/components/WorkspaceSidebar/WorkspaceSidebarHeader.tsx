import { LuLayers } from "react-icons/lu";

export function WorkspaceSidebarHeader() {
	return (
		<div className="flex items-center gap-2 px-3 py-2 border-b border-border h-10">
			<LuLayers className="w-4 h-4 text-muted-foreground" />
			<span className="text-sm font-medium text-muted-foreground">
				Workspaces
			</span>
		</div>
	);
}
