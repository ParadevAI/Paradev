import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import {
	type PullRequestStackMergeBlocker,
	type PullRequestStackVerdict,
	type StackLayerIssue,
	stackLayerIssue,
} from "../../utils/assessPullRequestStack";
import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "../usePullRequestStack";

type StackIdentity = Pick<
	PullRequestStack,
	"stackNumber" | "baseRefName" | "currentPosition" | "layers"
>;

export interface MergeActionKind {
	/** A stack lands several pull requests; otherwise the one. */
	stack: boolean;
	/** The base branch merges through a merge queue. */
	queue: boolean;
}

/** Every sentence the stack and merge-queue surfaces say, from structured state. */
export function usePullRequestStackCopy() {
	const { t } = useLingui();
	return useMemo(() => {
		const issue = (kind: StackLayerIssue): string => {
			switch (kind) {
				case "closed":
					return t({ message: "Closed" });
				case "draft":
					return t({ message: "Draft" });
				case "conflicts":
					return t({ message: "Conflicts", context: "pull request status" });
				case "changes_requested":
					return t({ message: "Changes requested" });
				case "review_required":
					return t({ message: "Review required" });
				case "blocked":
					return t({ message: "Blocked", context: "pull request status" });
				case "checks_failing":
					return t({ message: "Checks failing" });
				case "behind":
					return t({ message: "Behind base" });
				case "pending":
					return t({ message: "Checking", context: "pull request status" });
			}
		};
		const queued = (position: number | null): string =>
			position === null
				? t({ message: "Queued" })
				: t({ message: `Queued · ${position}` });

		return {
			verdict(verdict: PullRequestStackVerdict): string {
				switch (verdict) {
					case "ready":
						return t({ message: "Ready to merge", context: "stack verdict" });
					case "attention":
						return t({ message: "Stack needs attention" });
					case "unstable":
						return t({ message: "Mergeable with failing checks" });
					case "pending":
						return t({ message: "Merge status pending" });
					case "queued":
						return t({ message: "In the merge queue" });
					case "merged":
						return t({ message: "Stack merged", context: "stack verdict" });
				}
			},
			blocker(blocker: PullRequestStackMergeBlocker): string {
				if (blocker.kind === "incomplete") {
					return t({
						message:
							"Stack details could not be loaded. Refresh before merging.",
					});
				}
				if (blocker.kind === "not-a-stack") {
					const number = blocker.lowest;
					return t({
						message: `Merge #${number} first, or create a GitHub stack to merge these together.`,
					});
				}
				const number = blocker.number;
				switch (blocker.kind) {
					case "closed":
						return t({ message: `#${number} is closed without being merged.` });
					case "draft":
						return t({ message: `#${number} is still a draft.` });
					case "conflicts":
						return t({ message: `#${number} has conflicts.` });
					case "changes_requested":
						return t({ message: `#${number} has changes requested.` });
					case "review_required":
						return t({ message: `#${number} needs a review.` });
					case "blocked":
						return t({
							message: `#${number} is waiting on a required check or rule.`,
						});
					default:
						return t({ message: `#${number} is not ready to merge.` });
				}
			},
			/** One layer's state in a word or two; null when there is nothing to say. */
			layerStatus(layer: PullRequestStackLayer): string | null {
				if (layer.state !== "open") return null;
				if (layer.queue) return queued(layer.queue.position);
				const kind = stackLayerIssue(layer);
				return kind ? issue(kind) : null;
			},
			queued,
			action({ stack, queue }: MergeActionKind): string {
				if (stack) {
					return queue
						? t({ message: "Queue stack" })
						: t({ message: "Merge stack" });
				}
				return queue ? t({ message: "Add to queue" }) : t({ message: "Merge" });
			},
			busy({ stack, queue }: MergeActionKind): string {
				if (queue) return t({ message: "Adding to queue…" });
				return stack
					? t({ message: "Merging stack…" })
					: t({ message: "Merging…" });
			},
			summary(stack: StackIdentity): string {
				const base = stack.baseRefName;
				const stackNumber = stack.stackNumber;
				if (stackNumber !== null) {
					return t({ message: `Stack #${stackNumber} · targets ${base}` });
				}
				const pullRequests = t({
					message: plural(stack.layers.length, {
						one: "# pull request",
						other: "# pull requests",
					}),
				});
				return t({ message: `${pullRequests} · targets ${base}` });
			},
			position(stack: StackIdentity): string {
				const base = stack.baseRefName;
				const stackNumber = stack.stackNumber;
				const position = stack.currentPosition;
				const size = stack.layers.length;
				if (stackNumber !== null) {
					return t({
						message: `Stack #${stackNumber} · PR ${position} of ${size} · targets ${base}`,
					});
				}
				return t({ message: `PR ${position} of ${size} · targets ${base}` });
			},
			openLabel(stack: StackIdentity): string {
				const stackNumber = stack.stackNumber;
				const position = stack.currentPosition;
				const size = stack.layers.length;
				if (stackNumber !== null) {
					return t({
						message: `View stack ${stackNumber}, pull request ${position} of ${size}`,
					});
				}
				return t({
					message: `View stack, pull request ${position} of ${size}`,
				});
			},
		};
	}, [t]);
}
