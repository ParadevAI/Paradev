import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	ChannelAgent,
	ChannelAgentState,
} from "../../../../hooks/useChannelAgents";

export const STATE_LABELS: Record<ChannelAgentState, MessageDescriptor> = {
	waiting: msg({ message: "Needs you" }),
	working: msg({ message: "Working" }),
	review: msg({ message: "Ready for review" }),
	idle: msg({ message: "Idle" }),
	done: msg({ message: "Done" }),
};

/** One line under an agent's name: what it is doing, or where it stopped. */
export function agentDetail({
	workspace,
	state,
}: ChannelAgent): MessageDescriptor {
	const pr = workspace.pr;
	switch (state) {
		case "waiting":
			return workspace.agentStatus === "permission"
				? msg({ message: "Needs input" })
				: workspace.agentStatus === "review"
					? msg({ message: "Finished, unread" })
					: workspace.sandboxStatus === "failed"
						? msg({ message: "Sandbox failed" })
						: msg({ message: "Agent failed" });
		case "working":
			return msg({ message: "Working" });
		case "review":
			if (!pr) return msg({ message: "Finished, unread" });
			return pr.checksStatus === "success"
				? msg({ message: `PR #${pr.prNumber} · checks passed` })
				: pr.checksStatus === "failure"
					? msg({ message: `PR #${pr.prNumber} · checks failed` })
					: pr.checksStatus === "pending"
						? msg({ message: `PR #${pr.prNumber} · checks running` })
						: msg({ message: `PR #${pr.prNumber}` });
		case "done":
			return pr?.state === "merged"
				? msg({ message: `Merged #${pr.prNumber}` })
				: msg({ message: "Archived" });
		default:
			return msg({ message: `On ${workspace.branch}` });
	}
}

export function diffSummary(
	stats: ChannelAgent["workspace"]["diffStats"],
): string | null {
	if (!stats || stats.additions + stats.deletions === 0) return null;
	return `+${stats.additions} −${stats.deletions}`;
}

/**
 * The work's numbers in one phrase: "3 files +12 −4", or the word for none,
 * so an empty slot means the numbers are not known rather than zero.
 */
export function workSummary(
	stats: ChannelAgent["workspace"]["diffStats"],
	labels: { files: (count: number) => string; none: string },
): string | null {
	if (!stats) return null;
	const diff = diffSummary(stats);
	if (!diff) return labels.none;
	return stats.fileCount > 0
		? `${labels.files(stats.fileCount)} ${diff}`
		: diff;
}
