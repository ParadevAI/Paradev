import type { BackgroundTask } from "@superset/chat/protocol";
import { useMemo } from "react";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_GUTTER_CLASSNAME,
} from "../../../../constants";
import { LiveChangesPill } from "./components/LiveChangesPill";
import { RunningTasksChip } from "./components/RunningTasksChip";
import { runningTasks } from "./utils/runningTasks";

export function ComposerChips({
	backgroundTasks,
	liveRefreshKey,
	runningTurnId,
	onOpenSubagent,
	onStopTask,
}: {
	backgroundTasks: readonly BackgroundTask[] | undefined;
	liveRefreshKey: number;
	runningTurnId: string | null;
	onOpenSubagent: (itemId: string) => void;
	onStopTask: (taskId: string) => void;
}) {
	const { subagents, processes } = useMemo(
		() => runningTasks(backgroundTasks),
		[backgroundTasks],
	);
	return (
		<div className={CHAT_GUTTER_CLASSNAME}>
			<div className={CHAT_COLUMN_CLASSNAME}>
				<div className="mb-1.5 flex flex-wrap gap-1.5 empty:hidden">
					{runningTurnId && (
						<LiveChangesPill
							refreshKey={liveRefreshKey}
							turnId={runningTurnId}
						/>
					)}
					{subagents.length > 0 && (
						<RunningTasksChip
							kind="subagent"
							onOpen={onOpenSubagent}
							onStop={onStopTask}
							tasks={subagents}
						/>
					)}
					{processes.length > 0 && (
						<RunningTasksChip
							kind="process"
							onStop={onStopTask}
							tasks={processes}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
