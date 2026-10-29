import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset, CONTINUE_PROMPT } from "@superset/chat/core";
import { cn } from "@superset/ui/utils";
import {
	ArrowRight,
	CircleArrowUp,
	CircleCheck,
	LoaderCircle,
	X,
} from "lucide-react";
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
	"shrink-0 rounded px-1.5 font-medium text-foreground/90 transition-colors hover:bg-foreground/[0.07] hover:text-foreground";

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

	let icon: ReactNode;
	let text: ReactNode;
	let action: ReactNode = null;
	let dismiss = finish;
	if (phase === "updating") {
		icon = <LoaderCircle className="size-3.5 shrink-0 animate-spin" />;
		text = (
			<>
				<Trans>Updating {label}…</Trans>
				<span className="ml-2 text-muted-foreground/70">
					<Trans>Follow along in the terminal below.</Trans>
				</span>
			</>
		);
		if (latest) dismiss = () => dismissAgentCliUpdate(binary, latest);
	} else if (phase === "updated" && installed) {
		icon = <CircleCheck className="size-3.5 shrink-0" />;
		text = (
			<>
				<Trans>{label} updated</Trans>
				<span className="ml-2 text-muted-foreground/70">
					<Trans>Restart the chat to use {installed}.</Trans>
				</span>
			</>
		);
		if (onRestartAgent) {
			action = (
				<button
					className={ACTION_CLASSNAME}
					onClick={() => {
						finish();
						void onRestartAgent(turnRunning ? CONTINUE_PROMPT : undefined);
					}}
					type="button"
				>
					<Trans>Restart</Trans>
				</button>
			);
		}
	} else if (
		status.behind &&
		installed &&
		latest &&
		!isAgentCliUpdateDismissed(dismissedAt, binary, latest)
	) {
		icon = <CircleArrowUp className="size-3.5 shrink-0" />;
		text = (
			<>
				<Trans>{label} update available</Trans>
				<span className="ml-2 inline-flex items-center gap-1 font-mono">
					<span className="text-muted-foreground/70">{installed}</span>
					<ArrowRight
						aria-hidden
						className="size-3 shrink-0 text-muted-foreground/50"
					/>
					<span className="text-foreground/85">{latest}</span>
				</span>
			</>
		);
		action = canUpdate ? (
			<button
				className={ACTION_CLASSNAME}
				onClick={() => void update()}
				title={status.updateCommand ?? undefined}
				type="button"
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
		);
		dismiss = () => dismissAgentCliUpdate(binary, latest);
	} else {
		return null;
	}

	return (
		<div
			className={cn(
				"mb-1.5 flex items-center gap-2 px-3 text-muted-foreground text-xs",
				className,
			)}
			data-testid="agent-cli-update-notice"
		>
			{icon}
			<span className="min-w-0 flex-1 truncate">{text}</span>
			{action}
			<button
				aria-label={t({ message: "Dismiss" })}
				className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
				onClick={dismiss}
				type="button"
			>
				<X className="size-3" />
			</button>
		</div>
	);
}
