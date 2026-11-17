import type { BackgroundTask } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import {
	collectSessionWork,
	runningAgents,
} from "../../../../../../../../utils/collectAgentWork";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_GUTTER_CLASSNAME,
} from "../../../../constants";
import { LiveChangesPill } from "./components/LiveChangesPill";
import { RunningTasksChip } from "./components/RunningTasksChip";

export function ComposerChips({
	backgroundTasks,
	sessionId,
	terminalId,
	liveRefreshKey,
	runningTurnId,
	onOpenSubagent,
	onStopTask,
	onStopAll,
	onMoveToBackground,
}: {
	backgroundTasks: readonly BackgroundTask[] | undefined;
	sessionId: string;
	terminalId: string | undefined;
	liveRefreshKey: number;
	runningTurnId: string | null;
	onOpenSubagent: (itemId: string) => void;
	onStopTask: (taskId: string) => Promise<void>;
	/** Stops every running subagent, or the turn that runs the ones the host can't stop. */
	onStopAll?: (() => void) | undefined;
	onMoveToBackground: (taskId: string) => void;
}) {
	const { subagents, shells, agents } = useMemo(() => {
		const work = collectSessionWork(backgroundTasks, {
			terminalId: terminalId ?? "",
			sessionId,
		});
		return {
			subagents: work.filter((item) => item.kind === "subagent"),
			shells: work.filter((item) => item.kind === "shell"),
			agents: runningAgents(backgroundTasks),
		};
	}, [backgroundTasks, sessionId, terminalId]);
	return (
		<div className="relative z-10 h-0">
			<div
				className={cn(
					CHAT_GUTTER_CLASSNAME,
					"pointer-events-none absolute inset-x-0 bottom-0",
				)}
			>
				<div className={cn(CHAT_COLUMN_CLASSNAME, "@container")}>
					<div className="mb-1.5 flex max-w-full gap-1.5 empty:hidden [&>*]:pointer-events-auto">
						{runningTurnId && (
							<LiveChangesPill
								refreshKey={liveRefreshKey}
								turnId={runningTurnId}
							/>
						)}
						{subagents.length > 0 && (
							<RunningTasksChip
								count={agents.count}
								kind="subagent"
								onMoveToBackground={onMoveToBackground}
								onOpen={onOpenSubagent}
								onStop={onStopTask}
								onStopAll={onStopAll}
								work={subagents}
							/>
						)}
						{shells.length > 0 && (
							<RunningTasksChip
								kind="shell"
								onMoveToBackground={onMoveToBackground}
								onStop={onStopTask}
								work={shells}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
