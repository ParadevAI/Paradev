import { useEffect, useMemo, useRef } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import {
	useActivityPanelStore,
	useFinishedSubagents,
} from "../../stores/activityPanelStore";
import {
	type AgentBinding,
	type AgentWork,
	collectAgentWork,
} from "../../utils/collectAgentWork";

const sameSession = (
	binding: AgentBinding | undefined,
	item: Pick<AgentWork, "sessionId" | "agentSessionId">,
) =>
	binding !== undefined &&
	!binding.endedAt &&
	(binding.chatSessionId ?? undefined) === item.sessionId &&
	(binding.chatSessionId !== undefined ||
		(binding.agentSessionId ?? undefined) === item.agentSessionId);

export function useAgentWork(workspaceId: string) {
	const bindings = useTerminalAgentBindings(workspaceId);
	const work = useMemo(() => collectAgentWork(bindings.values()), [bindings]);
	const recordFinished = useActivityPanelStore((state) => state.recordFinished);
	const forgetStopped = useActivityPanelStore((state) => state.forgetStopped);
	const recorded = useFinishedSubagents(workspaceId);
	const previous = useRef<readonly AgentWork[]>([]);

	useEffect(() => {
		const { stoppedKeys } = useActivityPanelStore.getState();
		const gone = previous.current.filter(
			(item) => !work.runningKeys.has(item.key),
		);
		const finished = gone
			.filter(
				(item) =>
					!stoppedKeys.has(item.key) &&
					sameSession(bindings.get(item.terminalId), item),
			)
			.map((item) => ({
				key: item.key,
				name: item.name,
				terminalId: item.terminalId,
				taskId: item.taskId,
				...(item.sessionId ? { sessionId: item.sessionId } : {}),
				...(item.agentSessionId ? { agentSessionId: item.agentSessionId } : {}),
			}));
		previous.current = work.subagents;
		recordFinished(workspaceId, finished);
		forgetStopped(gone.map((item) => item.key));
	}, [work, bindings, workspaceId, recordFinished, forgetStopped]);

	const finished = useMemo(
		() =>
			recorded.filter(
				(entry) =>
					!work.runningKeys.has(entry.key) &&
					sameSession(bindings.get(entry.terminalId), entry),
			),
		[recorded, work, bindings],
	);

	return { ...work, finished };
}
