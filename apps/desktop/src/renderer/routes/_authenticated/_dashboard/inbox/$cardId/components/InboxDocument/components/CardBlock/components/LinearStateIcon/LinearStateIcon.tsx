import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import type { LinearStateView } from "../../types";

const DRAWN: Partial<Record<LinearStateView["type"], StatusType>> = {
	backlog: "backlog",
	unstarted: "unstarted",
	started: "started",
	completed: "completed",
	canceled: "canceled",
	duplicate: "canceled",
};

interface LinearStateIconProps {
	state: Pick<LinearStateView, "type" | "color">;
	className?: string;
}

/** A Linear status as the Tasks screens draw it; triage has no drawing of its own and takes the open circle. */
export function LinearStateIcon({ state, className }: LinearStateIconProps) {
	return (
		<StatusIcon
			type={DRAWN[state.type] ?? "unstarted"}
			color={state.color}
			progress={50}
			className={className}
		/>
	);
}
