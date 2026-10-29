import { Trans } from "@lingui/react/macro";
import { acpHarnessForPreset, CONTINUE_PROMPT } from "@superset/chat/core";
import { cn } from "@superset/ui/utils";
import {
	AGENT_CLI_UPDATE_DOCS_URL,
	type RunInTerminal,
	useAgentCliUpdate,
} from "../../../../../../hooks/useAgentCliUpdate";
import { AgentCliUpdateCard } from "../../../../../AgentCliUpdateCard";
import {
	dismissAgentCliUpdate,
	isAgentCliUpdateDismissed,
	useAgentCliUpdateDismissals,
} from "./stores/agentCliUpdateDismissals";

export function AgentCliUpdateNotice({
	agentLabel,
	className,
	onRestartAgent,
	onRunInTerminal,
	presetId,
	sessionId,
	turnRunning,
	workspaceId,
}: {
	agentLabel?: string;
	className?: string;
	onRestartAgent?: (prompt?: string) => Promise<boolean>;
	onRunInTerminal?: RunInTerminal;
	presetId?: string;
	sessionId: string | null;
	turnRunning: boolean;
	workspaceId: string;
}) {
	const { status, label, phase, canUpdate, update, finish } = useAgentCliUpdate(
		{
			agentLabel,
			workspaceId,
			harness: acpHarnessForPreset(presetId),
			sessionId,
			onRunInTerminal,
		},
	);
	const dismissedAt = useAgentCliUpdateDismissals((store) => store.dismissedAt);
	if (!status) return null;
	const { binary, installed, latest } = status;
	const cardClassName = cn("mb-2", className);

	const dismiss = latest ? () => dismissAgentCliUpdate(binary, latest) : finish;
	if (phase === "updating") {
		return (
			<AgentCliUpdateCard
				actions={[]}
				className={cardClassName}
				compact
				description={<Trans>Follow along in the terminal below.</Trans>}
				onDismiss={dismiss}
				state="updating"
				testId="agent-cli-update-notice"
				title={<Trans>Updating {label}…</Trans>}
			/>
		);
	}
	if (!installed) return null;
	if (phase === "updated") {
		return (
			<AgentCliUpdateCard
				actions={
					onRestartAgent
						? [
								{
									id: "restart",
									label: <Trans>Restart</Trans>,
									primary: true,
									onClick: () => {
										finish();
										void onRestartAgent(
											turnRunning ? CONTINUE_PROMPT : undefined,
										);
									},
								},
							]
						: []
				}
				className={cardClassName}
				compact
				description={<Trans>Restart the chat to use {installed}.</Trans>}
				onDismiss={finish}
				state="updated"
				testId="agent-cli-update-notice"
				title={<Trans>{label} updated</Trans>}
			/>
		);
	}

	if (!status.behind || !latest) return null;
	if (isAgentCliUpdateDismissed(dismissedAt, binary, latest)) return null;
	return (
		<AgentCliUpdateCard
			actions={[
				canUpdate
					? {
							id: "update",
							label: <Trans>Update</Trans>,
							primary: true,
							title: status.updateCommand ?? undefined,
							onClick: () => void update(),
						}
					: {
							id: "docs",
							label: <Trans>How to update</Trans>,
							href: AGENT_CLI_UPDATE_DOCS_URL,
						},
			]}
			className={cardClassName}
			compact
			description={`v${installed} → v${latest}`}
			onDismiss={dismiss}
			state="available"
			testId="agent-cli-update-notice"
			title={<Trans>{label} update available</Trans>}
		/>
	);
}
