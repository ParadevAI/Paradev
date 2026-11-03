import { Trans } from "@lingui/react/macro";
import { acpHarnessForPreset, CONTINUE_PROMPT } from "@superset/chat/core";
import { cn } from "@superset/ui/utils";
import { ArrowRight } from "lucide-react";
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
	const { status, label, phase, startedHere, canUpdate, update, finish } =
		useAgentCliUpdate({
			agentLabel,
			workspaceId,
			harness: acpHarnessForPreset(presetId),
			sessionId,
			onRunInTerminal,
		});
	const dismissedAt = useAgentCliUpdateDismissals((store) => store.dismissedAt);
	if (!status) return null;
	const { binary, installed, latest } = status;
	const cardClassName = cn("mb-2", className);

	const dismiss = latest ? () => dismissAgentCliUpdate(binary, latest) : finish;
	const dismissed =
		latest !== null && isAgentCliUpdateDismissed(dismissedAt, binary, latest);
	if (phase === "updating") {
		if (dismissed) return null;
		return (
			<AgentCliUpdateCard
				actions={[]}
				className={cardClassName}
				compact
				description={
					startedHere ? (
						<Trans>Follow along in the terminal below.</Trans>
					) : undefined
				}
				onDismiss={
					startedHere
						? () => {
								dismiss();
								finish();
							}
						: latest
							? dismiss
							: undefined
				}
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
									onClick: () => {
										void onRestartAgent(
											turnRunning ? CONTINUE_PROMPT : undefined,
										).then((restarted) => {
											if (restarted) finish();
										});
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
	if (dismissed) return null;
	return (
		<AgentCliUpdateCard
			actions={[
				canUpdate
					? {
							id: "update",
							label: <Trans>Update</Trans>,
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
			description={
				<span className="flex items-center gap-1.5 font-mono">
					<span className="text-popover-foreground/50">{installed}</span>
					<ArrowRight
						aria-hidden
						className="size-3 shrink-0 text-popover-foreground/30"
					/>
					<span className="font-medium text-popover-foreground/85">
						{latest}
					</span>
				</span>
			}
			onDismiss={dismiss}
			state="available"
			testId="agent-cli-update-notice"
			title={<Trans>{label} update available</Trans>}
		/>
	);
}
