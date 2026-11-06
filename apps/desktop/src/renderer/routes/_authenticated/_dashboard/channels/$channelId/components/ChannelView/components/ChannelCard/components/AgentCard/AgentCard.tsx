import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { LuChevronRight } from "react-icons/lu";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useAgentPreview } from "../../../../../../hooks/useAgentPreview";
import { deriveChannelAgentState } from "../../../../../../hooks/useChannelAgents";
import {
	agentDetail,
	STATE_LABELS,
	workSummary,
} from "../../../../../ChannelPane/utils/agentLabels";
import { StateDot } from "../../../../../StateDot";

interface AgentCardProps {
	workspaceId: string;
	/** What the creating command said, until the host answers. */
	name: string | null;
	branch: string | null;
	className?: string;
	onOpen: (workspaceId: string) => void;
}

/**
 * A workspace the coordinator made, drawn where it made it: its name, state
 * and branch, opening its page in the pane.
 */
export function AgentCard({
	workspaceId,
	name,
	branch,
	className,
	onOpen,
}: AgentCardProps) {
	const { t } = useLingui();
	const { all } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const workspace = all.find((candidate) => candidate.id === workspaceId);
	const preview = useAgentPreview(workspaceId);
	const state = workspace ? deriveChannelAgentState(workspace) : "idle";
	const status = !workspace
		? t({ message: "Starting…" })
		: state === "idle" || state === "working"
			? t(STATE_LABELS[state])
			: `${t(STATE_LABELS[state])} · ${t(agentDetail({ workspace, state }))}`;
	const shownBranch = workspace?.branch ?? branch;
	const meta = [
		shownBranch,
		workSummary(workspace?.diffStats ?? null, {
			files: (files) => t({ message: `${files} files` }),
			none: t({ message: "no changes" }),
		}),
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<button
			type="button"
			onClick={() => onOpen(workspaceId)}
			className={cn(
				"flex w-full items-start gap-2.5 rounded-[10px] border border-border bg-background py-2 pr-2 pl-3 text-left transition-colors hover:bg-fill-hover",
				className,
			)}
		>
			<StateDot state={state} className="mt-[7px]" />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="truncate text-[13px] leading-[18px] font-semibold">
						{workspace?.name ?? name ?? <Trans>Workspace</Trans>}
					</span>
					<span className="truncate text-[11px] text-muted-foreground">
						{status}
					</span>
					{(preview.at ?? workspace?.lastAgentEventAt) && (
						<span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
							{formatCompactRelativeTime(
								new Date(preview.at ?? workspace?.lastAgentEventAt ?? 0),
							)}
						</span>
					)}
				</span>
				{meta && (
					<span className="truncate font-mono text-[11px] leading-4 text-muted-foreground/70">
						{meta}
					</span>
				)}
			</span>
			<LuChevronRight className="mt-[9px] size-3.5 shrink-0 text-muted-foreground/60" />
		</button>
	);
}
