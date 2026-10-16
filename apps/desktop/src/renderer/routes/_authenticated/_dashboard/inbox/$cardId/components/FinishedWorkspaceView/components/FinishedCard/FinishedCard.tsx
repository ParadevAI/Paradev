import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { CardBlock } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock";
import type { SupersetWorkspaceView } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock/components/SupersetWorkspace";

interface FinishedCardProps {
	workspace: SupersetWorkspaceView;
	/** Present while the workspace has an agent session that takes a prompt. */
	onSendBack?: (feedback: string) => void;
	pending: boolean;
	failure: string | null;
	sent: boolean;
}

/** The server's "Agent finished" card, built here from what this app already knows about the workspace. */
export function FinishedCard({
	workspace,
	onSendBack,
	pending,
	failure,
	sent,
}: FinishedCardProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	return (
		<CardBlock
			block={{
				id: "finished",
				type: "card",
				actionable: true,
				card: {
					type: "superset.agent_finished",
					refs: { workspace: workspace.id },
				},
				resolved: {
					type: "superset.agent_finished",
					brand: "superset",
					state: "ok",
					title: t({ message: "Agent finished" }),
					subtitle: workspace.name,
					fields: [],
					view: { kind: "superset.agent_finished", workspace },
					notice: sent
						? { tone: "good", text: t({ message: "Sent to the agent" }) }
						: undefined,
					actions: onSendBack
						? [
								{
									id: "send_back",
									label: t({ message: "Send back" }),
									style: "primary",
									role: "primary",
									input: t({ message: "What the agent should do next" }),
								},
							]
						: [],
				},
			}}
			done={sent}
			pending={pending}
			failure={failure}
			onAct={(actionId, input) => {
				if (actionId === "send_back" && typeof input === "string")
					onSendBack?.(input);
			}}
			onConnect={(href) => void navigate({ href })}
		/>
	);
}
