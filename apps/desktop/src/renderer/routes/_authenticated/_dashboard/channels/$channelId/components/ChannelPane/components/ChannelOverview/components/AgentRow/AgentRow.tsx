import { useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { LuChevronRight } from "react-icons/lu";
import { useAgentPreview } from "../../../../../../hooks/useAgentPreview";
import type { ChannelAgent } from "../../../../../../hooks/useChannelAgents";
import { StateDot } from "../../../../../StateDot";
import {
	agentDetail,
	STATE_LABELS,
	workSummary,
} from "../../../../utils/agentLabels";

interface AgentRowProps {
	agent: ChannelAgent;
	onOpen: (workspaceId: string) => void;
}

/**
 * One agent in the Overview: its name and state, the work's numbers (branch,
 * pull request, files and lines), and what it last said, so the list reads
 * without opening anything.
 */
export function AgentRow({ agent, onOpen }: AgentRowProps) {
	const { t } = useLingui();
	const { workspace, state } = agent;
	const preview = useAgentPreview(workspace.id);
	const line =
		preview.line ?? (state === "idle" ? null : t(agentDetail(agent)));
	const at =
		preview.at ?? workspace.lastAgentEventAt ?? workspace.createdAt.getTime();
	const pr = workspace.pr;
	const meta = [
		workspace.branch,
		pr && `#${pr.prNumber}`,
		workSummary(workspace.diffStats, {
			files: (files) => t({ message: `${files} files` }),
			none: t({ message: "no changes" }),
		}),
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<button
			type="button"
			onClick={() => onOpen(workspace.id)}
			className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-fill-hover"
		>
			<StateDot state={state} className="mt-[7px]" />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-baseline gap-2">
					<span className="truncate text-[13px] leading-[18px] font-medium">
						{workspace.name}
					</span>
					<span className="shrink-0 text-[11px] text-muted-foreground">
						{t(STATE_LABELS[state])}
					</span>
					<span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
						{formatCompactRelativeTime(new Date(at))}
					</span>
				</span>
				<span className="truncate font-mono text-[11px] leading-4 text-muted-foreground/70">
					{meta}
				</span>
				{line && (
					<span className="line-clamp-2 text-[12px] leading-4 text-muted-foreground">
						{line}
					</span>
				)}
			</span>
			<LuChevronRight className="mt-[9px] size-3.5 shrink-0 text-muted-foreground/60" />
		</button>
	);
}
