import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useEffect, useRef } from "react";
import {
	AGENT_CLI_UPDATE_DOCS_URL,
	type RunInTerminal,
	useAgentCliUpdate,
} from "../../../../../../hooks/useAgentCliUpdate";
import {
	AgentCliUpdateCard,
	type AgentCliUpdateCardAction,
} from "../../../../../AgentCliUpdateCard";

/**
 * Shown when the chat cannot be used: the agent session had no transcript to
 * resume, or its process is gone (a host restart outlives the stored session,
 * which still reads "idle"). Both leave a pane that looks fine and fails on
 * send, so say what happened and offer the way out.
 *
 * A stopped chat resumes itself, so reaching here means resuming was not on
 * offer: no transcript to load, or no agent session left to load it from.
 */
export function AcpRecovery({
	agentLabel,
	detail,
	harness,
	onResume,
	onRunInTerminal,
	onStartNew,
	reason,
	sessionId,
	workspaceId,
}: {
	reason: "no-transcript" | "stopped" | "in-terminal";
	detail?: string | undefined;
	onResume?: () => void;
	onStartNew: () => void;
	workspaceId: string;
	/** Null when the chat failed before it had a session. */
	sessionId: string | null;
	harness?: string;
	agentLabel?: string;
	onRunInTerminal?: RunInTerminal;
}) {
	const { status, label, phase, canUpdate, update, finish } = useAgentCliUpdate(
		{
			agentLabel,
			workspaceId,
			harness,
			sessionId,
			onRunInTerminal,
		},
	);
	const tooOld = status?.belowFloor === true;
	const retry = onResume ?? onStartNew;
	const retried = useRef(false);
	useEffect(() => {
		if (phase !== "updated" || tooOld || retried.current) return;
		retried.current = true;
		finish();
		retry();
	}, [phase, tooOld, retry, finish]);

	const installed = status?.installed;
	const minVersion = status?.minVersion;
	const updating = phase === "updating";
	if (tooOld || updating) {
		const actions: AgentCliUpdateCardAction[] = [];
		if (!updating && canUpdate) {
			actions.push({
				id: "update",
				label: <Trans>Update {label}</Trans>,
				title: status?.updateCommand ?? undefined,
				onClick: () => void update(),
			});
		}
		if (!updating && !canUpdate) {
			actions.push({
				id: "docs",
				label: <Trans>How to update</Trans>,
				href: AGENT_CLI_UPDATE_DOCS_URL,
			});
		}
		if (onResume) {
			actions.push({
				id: "resume",
				label: <Trans>Resume</Trans>,
				onClick: onResume,
			});
		}
		actions.push({
			id: "new",
			label: <Trans>Start a new chat</Trans>,
			onClick: onStartNew,
		});
		return (
			<div className="flex h-full w-full items-center justify-center p-8">
				<AgentCliUpdateCard
					actions={actions}
					className="w-full max-w-sm"
					description={
						updating ? (
							<Trans>The chat resumes after the update.</Trans>
						) : (
							<Trans>
								Chat needs {minVersion} or newer. {installed} is installed.
							</Trans>
						)
					}
					state={updating ? "updating" : "required"}
					testId="agent-cli-update-recovery"
					title={
						updating ? (
							<Trans>Updating {label}…</Trans>
						) : (
							<Trans>{label} needs an update</Trans>
						)
					}
				/>
			</div>
		);
	}
	return (
		// w-full because the pane lays its children out in a row: without it this
		// sizes to its content and hugs the left edge.
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
			<p className="max-w-sm text-muted-foreground text-sm">
				{reason === "in-terminal" ? (
					<Trans>
						This chat stopped because the conversation continued in a terminal.
					</Trans>
				) : reason === "no-transcript" ? (
					<Trans>
						That agent session has no conversation to open yet — it was started
						but never prompted.
					</Trans>
				) : (
					<Trans>This chat was stopped.</Trans>
				)}
			</p>
			{detail && (
				<p className="max-w-lg font-mono text-[11px] text-muted-foreground/60">
					{detail}
				</p>
			)}
			<div className="flex gap-2">
				{onResume && (
					<Button onClick={onResume} size="sm">
						<Trans>Resume</Trans>
					</Button>
				)}
				<Button onClick={onStartNew} size="sm" variant="secondary">
					<Trans>Start a new chat</Trans>
				</Button>
			</div>
		</div>
	);
}
