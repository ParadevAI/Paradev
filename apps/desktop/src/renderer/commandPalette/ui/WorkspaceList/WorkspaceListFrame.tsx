import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";
import { V1WorkspaceList } from "./components/V1WorkspaceList";
import { WorkspaceSwitcherList } from "./components/WorkspaceSwitcherList";

/** The Workspaces frame pushed from the command list. */
export function WorkspaceListFrame() {
	const rawQuery = useCommandPaletteQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	return isV2CloudEnabled ? (
		<WorkspaceSwitcherList query={rawQuery} />
	) : (
		<V1WorkspaceList query={rawQuery.trim()} />
	);
}
