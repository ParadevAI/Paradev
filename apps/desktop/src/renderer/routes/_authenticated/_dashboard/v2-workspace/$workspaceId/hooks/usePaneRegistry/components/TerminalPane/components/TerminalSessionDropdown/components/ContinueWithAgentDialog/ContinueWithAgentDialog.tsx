import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { buildTerminalSessionHandoffPrompt } from "@superset/shared/session-handoff";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import type { CreateNewAgentSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useAgentSessionLauncher";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useTerminalAgentConfig } from "../../hooks/useTerminalAgentConfig";
import { resolveDefaultTargetConfigId } from "./utils/resolveDefaultTargetConfigId";

/** Rough enough to size a decision: agents bill by token, not character. */
const CHARS_PER_TOKEN = 3.5;

function estimateTokens(characters: number): number {
	return Math.round(characters / CHARS_PER_TOKEN);
}

interface ContinueWithAgentDialogProps {
	workspaceId: string;
	terminalId: string;
	onClose: () => void;
	onCreateNewAgentSession: CreateNewAgentSession;
}

export function ContinueWithAgentDialog({
	workspaceId,
	terminalId,
	onClose,
	onCreateNewAgentSession,
}: ContinueWithAgentDialogProps) {
	const { formatNumber } = useFormat();
	const { t } = useLingui();
	const { binding, configs, sourceConfig } = useTerminalAgentConfig(
		workspaceId,
		terminalId,
	);
	const trpcUtils = workspaceTrpc.useUtils();
	const defaultTargetConfigId = resolveDefaultTargetConfigId(
		configs.map((config) => config.id),
		typeof window === "undefined"
			? null
			: window.localStorage.getItem(AGENT_STORAGE_KEY),
		sourceConfig?.id,
	);
	const [targetConfigId, setTargetConfigId] = useState(defaultTargetConfigId);
	const [isStarting, setIsStarting] = useState(false);
	const [transcript, setTranscript] = useState<string | null>(null);
	const [transcriptFailed, setTranscriptFailed] = useState(false);
	const selectedConfig = configs.find((config) => config.id === targetConfigId);

	// Fetched when the dialog opens rather than on Continue, so the size of
	// what is about to be sent is on screen before the decision.
	useEffect(() => {
		let cancelled = false;
		trpcUtils.terminal.transcript
			.fetch({ workspaceId, terminalId })
			.then((result) => {
				if (!cancelled) setTranscript(result.text ?? "");
			})
			.catch(() => {
				// Distinct from an empty terminal: reporting "0 characters" and
				// leaving Continue armed would fail only after the click.
				if (!cancelled) setTranscriptFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [terminalId, trpcUtils, workspaceId]);

	useEffect(() => {
		if (!targetConfigId && defaultTargetConfigId) {
			setTargetConfigId(defaultTargetConfigId);
		}
	}, [defaultTargetConfigId, targetConfigId]);

	const start = async () => {
		if (!selectedConfig || !transcript) return;
		setIsStarting(true);
		try {
			const result = await onCreateNewAgentSession({
				configId: selectedConfig.id,
				placement: "new-tab",
				prompt: buildTerminalSessionHandoffPrompt({
					transcript,
					sourceAgentLabel: sourceConfig?.label ?? binding?.agentId ?? "",
					sourceTerminalId: terminalId,
				}),
			});
			if (result) onClose();
		} finally {
			setIsStarting(false);
		}
	};

	return (
		<Dialog
			modal
			open
			onOpenChange={(open) => {
				if (!open && !isStarting) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Continue with another agent</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Start a fresh agent session seeded with this terminal's recent
							context. Workspace files remain the source of truth.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-2 py-1">
					<Label>
						<Trans>Target agent</Trans>
					</Label>
					<AgentSelect
						agents={configs.map((config) => ({
							id: config.id,
							label: config.label,
							iconId: config.presetId,
							presetId: config.presetId,
						}))}
						value={targetConfigId}
						placeholder={t({
							message: "Select an agent",
						})}
						onValueChange={setTargetConfigId}
						disabled={isStarting || configs.length === 0}
						triggerClassName="w-full"
						onBeforeConfigureAgents={onClose}
					/>
					{selectedConfig && (
						<p className="text-muted-foreground text-xs">
							{transcriptFailed ? (
								<Trans>Couldn't read this terminal's context.</Trans>
							) : transcript === null ? (
								<Trans>
									Measuring the context to send to {selectedConfig.label}…
								</Trans>
							) : transcript.length === 0 ? (
								<Trans>This terminal has no output to hand over yet.</Trans>
							) : (
								<Trans>
									Sends {formatNumber(transcript.length)} characters of terminal
									context (about{" "}
									{formatNumber(estimateTokens(transcript.length))} tokens) to{" "}
									{selectedConfig.label}.
								</Trans>
							)}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={isStarting}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={start}
						disabled={isStarting || !selectedConfig || !transcript}
					>
						{isStarting ? <Trans>Starting…</Trans> : <Trans>Continue</Trans>}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
