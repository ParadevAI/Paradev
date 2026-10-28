import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset, CONTINUE_PROMPT } from "@superset/chat/core";
import { cn } from "@superset/ui/utils";
import { CircleArrowUp, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import {
	AGENT_CLI_UPDATE_DOCS_URL,
	type RunInTerminal,
	useAgentCliUpdate,
} from "../../../../../../hooks/useAgentCliUpdate";
import {
	dismissAgentCliUpdate,
	isAgentCliUpdateDismissed,
	useAgentCliUpdateDismissals,
} from "./stores/agentCliUpdateDismissals";

const ACTION_CLASSNAME =
	"flex h-5 shrink-0 items-center rounded px-1.5 font-medium text-foreground transition-colors hover:bg-foreground/[0.07] disabled:opacity-50";

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
	const { t } = useLingui();
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

	const row = (text: ReactNode, action: ReactNode, onDismiss: () => void) => (
		<div
			data-testid="agent-cli-update-notice"
			className={cn(
				"mb-1.5 flex items-center gap-2 px-3 text-muted-foreground text-xs",
				className,
			)}
		>
			{phase === "updating" ? (
				<LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" />
			) : (
				<CircleArrowUp aria-hidden className="size-3.5 shrink-0 text-primary" />
			)}
			<span className="min-w-0 flex-1 truncate tabular-nums">{text}</span>
			{action}
			<button
				type="button"
				aria-label={t({ message: "Dismiss" })}
				onClick={onDismiss}
				className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
			>
				<X className="size-3" />
			</button>
		</div>
	);

	const dismiss = latest ? () => dismissAgentCliUpdate(binary, latest) : finish;
	if (phase === "updating") {
		return row(<Trans>Updating {label} in a terminal…</Trans>, null, dismiss);
	}
	if (!installed) return null;
	if (phase === "updated") {
		return row(
			<Trans>
				{label} {installed} is installed. Restart the chat to use it.
			</Trans>,
			onRestartAgent && (
				<button
					type="button"
					className={ACTION_CLASSNAME}
					onClick={() => {
						finish();
						void onRestartAgent(turnRunning ? CONTINUE_PROMPT : undefined);
					}}
				>
					<Trans>Restart</Trans>
				</button>
			),
			finish,
		);
	}

	if (!status.behind || !latest) return null;
	if (isAgentCliUpdateDismissed(dismissedAt, binary, latest)) return null;
	return row(
		<Trans>
			{label} {latest} is available. You have {installed}.
		</Trans>,
		canUpdate ? (
			<button
				type="button"
				className={ACTION_CLASSNAME}
				onClick={() => void update()}
				title={status.updateCommand ?? undefined}
			>
				<Trans>Update</Trans>
			</button>
		) : (
			<a
				className={ACTION_CLASSNAME}
				href={AGENT_CLI_UPDATE_DOCS_URL}
				rel="noopener noreferrer"
				target="_blank"
			>
				<Trans>How to update</Trans>
			</a>
		),
		dismiss,
	);
}
