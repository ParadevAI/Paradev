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
import { PanelRight, SquareStack } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useHandoffSource } from "../../hooks/useHandoffSource";

type Placement = "split-pane" | "new-tab";

/** Rough enough to size a decision: agents bill by token, not character. */
const CHARS_PER_TOKEN = 3.5;

function estimateTokens(characters: number): number {
	return Math.round(characters / CHARS_PER_TOKEN);
}

export type SessionAction = "handoff" | "fork";

interface TerminalSessionHandoffDialogProps {
	workspaceId: string;
	terminalId: string;
	action: SessionAction | null;
	onActionChange: (action: SessionAction | null) => void;
	onCreateNewAgentSession: (input: {
		configId: string;
		placement: Placement;
		prompt: string;
		forkSessionId?: string;
	}) => Promise<{ terminalId: string } | null>;
}

export function TerminalSessionHandoffDialog({
	workspaceId,
	terminalId,
	action,
	onActionChange: setAction,
	onCreateNewAgentSession,
}: TerminalSessionHandoffDialogProps) {
	const { formatNumber } = useFormat();

	const { t } = useLingui();
	const { binding, configs, sourceConfig, canFork, defaultTargetConfigId } =
		useHandoffSource(workspaceId, terminalId);
	const trpcUtils = workspaceTrpc.useUtils();
	const [targetConfigId, setTargetConfigId] = useState("");
	const [placement, setPlacement] = useState<Placement>("split-pane");
	const [isStarting, setIsStarting] = useState(false);
	const [transcript, setTranscript] = useState<string | null>(null);
	const [transcriptFailed, setTranscriptFailed] = useState(false);
	const selectedConfig = configs.find((config) => config.id === targetConfigId);

	// Fetched when the dialog opens rather than on Continue, so the size of
	// what is about to be sent is on screen before the decision.
	useEffect(() => {
		if (action !== "handoff") {
			setTranscript(null);
			setTranscriptFailed(false);
			return;
		}
		let cancelled = false;
		setTranscriptFailed(false);
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
	}, [action, terminalId, trpcUtils, workspaceId]);

	useEffect(() => {
		if (action === null) return;
		setPlacement("split-pane");
		setTargetConfigId("");
	}, [action]);

	useEffect(() => {
		if (action !== "handoff" || targetConfigId) return;
		if (defaultTargetConfigId) setTargetConfigId(defaultTargetConfigId);
	}, [action, defaultTargetConfigId, targetConfigId]);

	if (!binding) return null;

	const start = async () => {
		if (!action) return;
		setIsStarting(true);
		try {
			if (action === "fork") {
				if (!sourceConfig || !binding.agentSessionId || !canFork) return;
				const result = await onCreateNewAgentSession({
					configId: sourceConfig.id,
					placement,
					prompt: "",
					forkSessionId: binding.agentSessionId,
				});
				if (result) setAction(null);
				return;
			}

			if (!selectedConfig) return;
			// Continue stays disabled without a transcript, and the dialog says
			// why inline; this only guards the impossible.
			if (!transcript) return;
			const result = await onCreateNewAgentSession({
				configId: selectedConfig.id,
				placement,
				prompt: buildTerminalSessionHandoffPrompt({
					transcript,
					sourceAgentLabel: sourceConfig?.label ?? binding.agentId,
					sourceTerminalId: terminalId,
				}),
			});
			if (result) setAction(null);
		} finally {
			setIsStarting(false);
		}
	};

	const title =
		action === "fork" ? (
			<Trans>Fork session</Trans>
		) : (
			<Trans>Continue with another agent</Trans>
		);

	return (
		<Dialog
			modal
			open={action !== null}
			onOpenChange={(open) => {
				if (!open && !isStarting) setAction(null);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{action === "fork" ? (
							<Trans>
								Create a native provider fork with the same conversation
								context. The original session stays unchanged.
							</Trans>
						) : (
							<Trans>
								Start a fresh agent session seeded with this terminal's recent
								context. Workspace files remain the source of truth.
							</Trans>
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-1">
					{action === "handoff" ? (
						<div className="flex flex-col gap-2">
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
								onBeforeConfigureAgents={() => setAction(null)}
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
											Sends {formatNumber(transcript.length)} characters of
											terminal context (about{" "}
											{formatNumber(estimateTokens(transcript.length))} tokens)
											to {selectedConfig.label}.
										</Trans>
									)}
								</p>
							)}
						</div>
					) : (
						<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
							<Trans>Provider: {sourceConfig?.label ?? binding.agentId}</Trans>
						</div>
					)}

					<div className="flex flex-col gap-2">
						<Label>
							<Trans>Open session in</Trans>
						</Label>
						<div className="grid grid-cols-2 gap-2" role="radiogroup">
							<Button
								type="button"
								variant={placement === "split-pane" ? "secondary" : "outline"}
								onClick={() => setPlacement("split-pane")}
								aria-pressed={placement === "split-pane"}
								disabled={isStarting}
							>
								<PanelRight />
								<Trans>Split pane</Trans>
							</Button>
							<Button
								type="button"
								variant={placement === "new-tab" ? "secondary" : "outline"}
								onClick={() => setPlacement("new-tab")}
								aria-pressed={placement === "new-tab"}
								disabled={isStarting}
							>
								<SquareStack />
								<Trans>New tab</Trans>
							</Button>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => setAction(null)}
						disabled={isStarting}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						onClick={start}
						disabled={
							isStarting ||
							(action === "fork"
								? !canFork
								: // Nothing to hand over, or the read failed: refuse before
									// the click rather than after it.
									!selectedConfig || !transcript)
						}
					>
						{isStarting ? (
							<Trans>Starting…</Trans>
						) : action === "fork" ? (
							<Trans>Fork session</Trans>
						) : (
							<Trans>Continue</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
