import { useLingui } from "@lingui/react/macro";
import { createSessionClient, type SessionClient } from "@superset/chat/client";
import type { WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useMemo } from "react";
import type { StoreApi } from "zustand/vanilla";
import { useChatWiring } from "../../../../hooks/usePaneRegistry/components/ChatSession/hooks/useSessionClient";
import { useChatSubagentStore } from "../../../../hooks/usePaneRegistry/stores/chatSubagentStore";
import type { PaneViewerData } from "../../../../types";
import { focusTerminalPane } from "../../../../utils/focusTerminalPane";
import { useActivityPanelStore } from "../../stores/activityPanelStore";
import type { AgentWork } from "../../utils/collectAgentWork";

export function useAgentWorkActions(
	stores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[],
) {
	const { t } = useLingui();
	const wiring = useChatWiring();

	return useMemo(() => {
		const withClient = async <Result>(
			sessionId: string,
			run: (client: SessionClient) => Promise<Result>,
		) => {
			const client = createSessionClient({ sessionId, ...wiring });
			try {
				return await run(client);
			} finally {
				client.close();
			}
		};
		const focus = (terminalId: string) =>
			stores.some((store) => focusTerminalPane(store, terminalId));

		return {
			open: (
				target: Pick<AgentWork, "terminalId" | "taskId" | "sessionId">,
				{ subagent }: { subagent: boolean },
			) => {
				if (!focus(target.terminalId)) return;
				if (subagent && target.sessionId)
					useChatSubagentStore
						.getState()
						.open(target.terminalId, target.taskId);
			},
			stop: async (work: AgentWork) => {
				const { sessionId } = work;
				if (!sessionId) return;
				const { noteStopped, forgetStopped } = useActivityPanelStore.getState();
				noteStopped(work.key);
				await withClient(sessionId, (client) =>
					client.stopBackgroundTask(work.taskId),
				)
					.then((stopped) => {
						if (!stopped) throw new Error("the agent did not stop the task");
					})
					.catch((error: unknown) => {
						forgetStopped([work.key]);
						console.warn("[WorkspaceActivityMenu] could not stop task", error);
						toast.error(t({ message: "Couldn't stop the background task" }));
					});
			},
			moveToBackground: async (work: AgentWork) => {
				const { sessionId } = work;
				if (!sessionId) return;
				await withClient(sessionId, (client) =>
					client.backgroundSubagent(work.taskId),
				)
					.then((result) => {
						if (result === "unsupported")
							toast.error(
								t({
									message:
										"Update this host to move subagents to the background",
								}),
							);
						else if (result === "refused")
							toast.error(
								t({
									message: "This subagent can't move to the background now",
								}),
							);
					})
					.catch((error: unknown) => {
						console.warn(
							"[WorkspaceActivityMenu] could not move the subagent",
							error,
						);
						toast.error(
							t({ message: "Couldn't move the subagent to the background" }),
						);
					});
			},
		};
	}, [stores, wiring, t]);
}
