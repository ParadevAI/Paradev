import { WorkspaceSwitcherFooter } from "./components/WorkspaceSwitcherFooter";
import {
	type SwitcherCycle,
	WorkspaceSwitcherList,
} from "./components/WorkspaceSwitcherList";

interface WorkspaceSwitcherViewProps {
	query: string;
	cycle: SwitcherCycle;
}

export function WorkspaceSwitcherView({
	query,
	cycle,
}: WorkspaceSwitcherViewProps) {
	return (
		<>
			<WorkspaceSwitcherList query={query} cycle={cycle} />
			<WorkspaceSwitcherFooter />
		</>
	);
}
