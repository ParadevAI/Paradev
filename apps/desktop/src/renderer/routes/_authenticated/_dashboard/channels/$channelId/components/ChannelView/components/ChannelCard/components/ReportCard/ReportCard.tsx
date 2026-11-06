import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuChevronRight } from "react-icons/lu";
import { useAgentLastMessage } from "../../../../../../hooks/useAgentSession";
import { useAgentWorkspace } from "../../../../../../hooks/useAgentWorkspace";
import { deriveChannelAgentState } from "../../../../../../hooks/useChannelAgents";
import { plainText } from "../../../../../../utils/plainText";
import { StateDot } from "../../../../../StateDot";

interface ReportCardProps {
	workspaceId: string;
	sessionId: string;
	/** What the coordinator's read printed, shown until the host answers. */
	text: string;
	className?: string;
	onOpen: (workspaceId: string) => void;
}

/**
 * What an agent said, in its own words, drawn where the coordinator read it:
 * the agent's name and state over its newest message, opening its chat.
 */
export function ReportCard({
	workspaceId,
	sessionId,
	text,
	className,
	onOpen,
}: ReportCardProps) {
	const { workspace, hostUrl } = useAgentWorkspace(workspaceId);
	const live = useAgentLastMessage(hostUrl, workspaceId, sessionId);
	const state = workspace ? deriveChannelAgentState(workspace) : "idle";
	const message = plainText(live.data?.text ?? text);
	if (!message) return null;
	return (
		<button
			type="button"
			onClick={() => onOpen(workspaceId)}
			className={cn(
				"flex w-full flex-col gap-1.5 rounded-[10px] border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-fill-hover",
				className,
			)}
		>
			<span className="flex items-center gap-2 text-[11px] leading-[14px] text-muted-foreground">
				<StateDot state={state} />
				<span className="truncate font-semibold text-foreground">
					{workspace?.name ?? <Trans>Agent</Trans>}
				</span>
				<Trans>said</Trans>
				<LuChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
			</span>
			<span className="line-clamp-4 whitespace-pre-line text-[13px] leading-[18px] text-foreground/90">
				{message}
			</span>
		</button>
	);
}
