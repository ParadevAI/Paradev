import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { LuGitBranch } from "react-icons/lu";
import { useAgentWorkspace } from "../../../../../../hooks/useAgentWorkspace";
import { deriveChannelAgentState } from "../../../../../../hooks/useChannelAgents";
import { StateDot } from "../../../../../StateDot";
import { agentDetail, STATE_LABELS } from "../../../../utils/agentLabels";

/** The pane's title for an agent: its name, with its state and branch under it. */
export function AgentPageTitle({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const { workspace } = useAgentWorkspace(workspaceId);
	if (!workspace) {
		return (
			<span className="truncate">
				<Trans>Agent</Trans>
			</span>
		);
	}
	const state = deriveChannelAgentState(workspace);
	const detail =
		state === "idle" || state === "working"
			? null
			: t(agentDetail({ workspace, state }));
	const at = workspace.lastAgentEventAt;
	return (
		<span className="flex min-w-0 flex-col gap-px">
			<span className="truncate leading-[16px]">{workspace.name}</span>
			<span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-[14px] font-normal text-muted-foreground">
				<StateDot state={state} />
				<span className="shrink-0">{t(STATE_LABELS[state])}</span>
				{detail && <span className="shrink-0">· {detail}</span>}
				{at && (
					<span className="shrink-0 tabular-nums">
						· {formatCompactRelativeTime(new Date(at))}
					</span>
				)}
				<span className="flex min-w-0 items-center gap-1">
					<LuGitBranch className="size-3 shrink-0" />
					<span className="truncate font-mono">{workspace.branch}</span>
				</span>
			</span>
		</span>
	);
}
