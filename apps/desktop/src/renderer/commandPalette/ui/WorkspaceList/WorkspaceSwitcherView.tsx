import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useFrameStackStore } from "../../core/frames";
import { V1WorkspaceList } from "./components/V1WorkspaceList";
import { WorkspaceSwitcherFooter } from "./components/WorkspaceSwitcherFooter";
import {
	type SwitcherCycle,
	WorkspaceSwitcherList,
} from "./components/WorkspaceSwitcherList";

interface WorkspaceSwitcherViewProps {
	query: string;
	cycle: SwitcherCycle;
}

/** The palette's switcher root: the list plus the keys that act on its selection. */
export function WorkspaceSwitcherView({
	query,
	cycle,
}: WorkspaceSwitcherViewProps) {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const selection = useFrameStackStore((s) => s.switcherSelection);
	if (!isV2CloudEnabled) return <V1WorkspaceList query={query.trim()} />;
	return (
		<>
			<WorkspaceSwitcherList query={query} cycle={cycle} />
			<WorkspaceSwitcherFooter selection={selection} />
		</>
	);
}
