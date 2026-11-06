import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import {
	LuCheck,
	LuGitMerge,
	LuGitPullRequest,
	LuLoader,
	LuX,
} from "react-icons/lu";
import {
	type ChannelAgent,
	useChannelAgents,
} from "../../../../hooks/useChannelAgents";
import type { ChannelPanePage } from "../../../../stores/channelPaneStore";
import { diffSummary } from "../../utils/agentLabels";
import { PaneRow } from "../PaneRow";

interface PullRequestsPageProps {
	channelName: string;
	onOpen: (page: ChannelPanePage) => void;
}

function prGlyph(pr: NonNullable<ChannelAgent["workspace"]["pr"]>) {
	if (pr.state === "merged")
		return <LuGitMerge className="size-3.5 text-purple-500" />;
	if (pr.checksStatus === "success")
		return <LuCheck className="size-3.5 text-green-500" />;
	if (pr.checksStatus === "failure")
		return <LuX className="size-3.5 text-red-500" />;
	if (pr.checksStatus === "pending")
		return <LuLoader className="size-3.5 animate-spin" />;
	return <LuGitPullRequest className="size-3.5" />;
}

/** Every pull request the channel's agents opened, merged ones last. */
export function PullRequestsPage({
	channelName,
	onOpen,
}: PullRequestsPageProps) {
	const { t } = useLingui();
	const { agents } = useChannelAgents(channelName);
	const withPr = agents
		.filter((agent) => agent.workspace.pr !== null)
		.sort(
			(a, b) =>
				Number(a.workspace.pr?.state === "merged") -
				Number(b.workspace.pr?.state === "merged"),
		);
	const stateLabel = (pr: NonNullable<ChannelAgent["workspace"]["pr"]>) => {
		if (pr.state === "merged") return t({ message: "merged" });
		if (pr.state === "closed") return t({ message: "closed" });
		if (pr.state === "draft") return t({ message: "draft" });
		if (pr.state === "queued") return t({ message: "in the merge queue" });
		if (pr.checksStatus === "success") return t({ message: "checks passed" });
		if (pr.checksStatus === "failure") return t({ message: "checks failed" });
		if (pr.checksStatus === "pending") return t({ message: "checks running" });
		return t({ message: "open" });
	};

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-px p-3">
				{withPr.length === 0 ? (
					<p className="px-2 py-1 text-[13px] leading-[18px] text-muted-foreground">
						<Trans>
							No pull requests yet. When an agent opens one, it shows here with
							its checks and review.
						</Trans>
					</p>
				) : (
					withPr.map(({ workspace }) => {
						const pr = workspace.pr;
						if (!pr) return null;
						const diff = diffSummary(workspace.diffStats);
						return (
							<PaneRow
								key={workspace.id}
								leading={prGlyph(pr)}
								label={pr.title}
								detail={`#${pr.prNumber} · ${stateLabel(pr)}${diff ? ` · ${diff}` : ""}`}
								trailing={
									workspace.lastAgentEventAt
										? formatCompactRelativeTime(
												new Date(workspace.lastAgentEventAt),
											)
										: undefined
								}
								onClick={() => onOpen({ kind: "agent", id: workspace.id })}
							/>
						);
					})
				)}
			</div>
		</div>
	);
}
