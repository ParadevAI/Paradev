import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import type {
	PullRequestStackMergeBlocker,
	PullRequestStackVerdict,
} from "../../utils/assessPullRequestStack";
import type { PullRequestStack } from "../usePullRequestStack";

type StackIdentity = Pick<
	PullRequestStack,
	"stackNumber" | "baseRefName" | "currentPosition" | "layers"
>;

/** Every sentence the stack surfaces say, from the structured verdict and blockers. */
export function usePullRequestStackCopy() {
	const { t } = useLingui();
	return useMemo(
		() => ({
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
					case "merged":
						return t({ message: "Stack merged", context: "stack verdict" });
				}
			},
			blocker(blocker: PullRequestStackMergeBlocker): string {
				switch (blocker.kind) {
					case "incomplete":
						return t({
							message:
								"Stack details could not be loaded. Refresh before merging.",
						});
					case "closed": {
						const number = blocker.number;
						return t({ message: `#${number} is closed without being merged.` });
					}
					case "draft": {
						const number = blocker.number;
						return t({ message: `#${number} is still a draft.` });
					}
					case "not-ready": {
						const number = blocker.number;
						return t({ message: `#${number} is not ready to merge.` });
					}
					case "lower-layer": {
						const number = blocker.number;
						return t({
							message: `Merge #${number} first. A stack built from base branches merges one pull request at a time.`,
						});
					}
				}
			},
			summary(stack: StackIdentity): string {
				const base = stack.baseRefName;
				const stackNumber = stack.stackNumber;
				if (stackNumber !== null) {
					return t({ message: `Stack #${stackNumber} · targets ${base}` });
				}
				return t({
					message: plural(stack.layers.length, {
						one: `# pull request · targets ${base}`,
						other: `# pull requests · targets ${base}`,
					}),
				});
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
		}),
		[t],
	);
}
