import { useNavigate } from "@tanstack/react-router";
import type { CardViewOf } from "../../../../types";

type AutomationRunSession =
	CardViewOf<"superset.automation_failed">["run"]["session"];

/** Opens a run where the runs list does: its workspace and terminal, else the automation's run history. */
export function useOpenRun(automationId: string) {
	const navigate = useNavigate();
	return (session: AutomationRunSession) => {
		if (session?.location === "cloud") {
			void navigate({
				to: "/cloud-workspaces/$workspaceId",
				params: { workspaceId: session.workspaceId },
			});
			return;
		}
		if (session?.location === "local") {
			localStorage.setItem("lastViewedWorkspaceId", session.workspaceId);
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: session.workspaceId },
				search: { terminalId: session.terminalId ?? undefined },
			});
			return;
		}
		void navigate({
			to: "/automations/$automationId",
			params: { automationId },
			search: { history: true },
		});
	};
}
