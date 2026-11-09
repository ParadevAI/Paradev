import { stackMergeTargets } from "@superset/shared/pull-request-stack";
import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "../../hooks/usePullRequestStack";

export { stackMergeTargets };

export type PullRequestStackVerdict =
	| "merged"
	| "queued"
	| "attention"
	| "unstable"
	| "pending"
	| "ready";

/** What stands between one open layer and a merge; the first that applies. */
export type StackLayerIssue =
	| "closed"
	| "draft"
	| "conflicts"
	| "changes_requested"
	| "review_required"
	| "blocked"
	| "checks_failing"
	| "behind"
	| "pending";

const BLOCKING_ISSUES: ReadonlySet<StackLayerIssue> = new Set([
	"closed",
	"draft",
	"conflicts",
	"changes_requested",
	"review_required",
	"blocked",
]);

export interface PullRequestStackBlocker {
	kind: StackLayerIssue;
	number: number;
}

export type PullRequestStackMergeBlocker =
	| PullRequestStackBlocker
	| { kind: "incomplete" }
	/** A chain of base branches: GitHub merges it one pull request at a time. */
	| { kind: "not-a-stack"; lowest: number };

export interface PullRequestStackAssessment {
	verdict: PullRequestStackVerdict;
	/** What a merge of the current layer lands, trunk-most first. */
	targets: PullRequestStackLayer[];
	blocker: PullRequestStackBlocker | null;
}

export function stackLayerIssue(
	layer: Pick<
		PullRequestStackLayer,
		| "state"
		| "isDraft"
		| "mergeable"
		| "mergeStateStatus"
		| "reviewDecision"
		| "queue"
	>,
): StackLayerIssue | null {
	if (layer.state === "merged" || layer.queue) return null;
	if (layer.state === "closed") return "closed";
	if (layer.isDraft || layer.mergeStateStatus === "DRAFT") return "draft";
	if (layer.mergeable === "conflicting" || layer.mergeStateStatus === "DIRTY") {
		return "conflicts";
	}
	if (layer.mergeStateStatus === "BLOCKED") {
		if (layer.reviewDecision === "changes_requested") {
			return "changes_requested";
		}
		if (layer.reviewDecision === "review_required") return "review_required";
		return "blocked";
	}
	if (layer.mergeStateStatus === "UNSTABLE") return "checks_failing";
	if (layer.mergeStateStatus === "BEHIND") return "behind";
	if (
		layer.mergeable === "unknown" ||
		layer.mergeStateStatus === null ||
		layer.mergeStateStatus === "UNKNOWN"
	) {
		return "pending";
	}
	return null;
}

/** One verdict over the layers a merge would land; the first rule that matches wins. */
export function assessPullRequestStack(
	stack: Pick<PullRequestStack, "layers" | "currentPosition">,
): PullRequestStackAssessment {
	const targets = stackMergeTargets(stack);
	const assessment = (
		verdict: PullRequestStackVerdict,
		blocker: PullRequestStackBlocker | null = null,
	): PullRequestStackAssessment => ({ verdict, targets, blocker });

	if (targets.length === 0) return assessment("merged");
	if (targets.every((layer) => layer.queue)) return assessment("queued");

	const issues = targets.flatMap((layer) => {
		const kind = stackLayerIssue(layer);
		return kind ? [{ kind, number: layer.number }] : [];
	});
	const blocking = issues.find((issue) => BLOCKING_ISSUES.has(issue.kind));
	if (blocking) return assessment("attention", blocking);
	if (issues.some((issue) => issue.kind === "checks_failing")) {
		return assessment("unstable");
	}
	if (issues.length > 0) return assessment("pending");
	return assessment("ready");
}

/**
 * Why a stack merge cannot run now, or null when it can. A chain inferred
 * from base branches is no stack on GitHub, so only its lowest open layer
 * can merge into the trunk.
 */
export function resolveStackMergeBlocker({
	stack,
	isIncomplete,
}: {
	stack: Pick<PullRequestStack, "layers" | "currentPosition" | "source"> | null;
	isIncomplete: boolean;
}): PullRequestStackMergeBlocker | null {
	if (isIncomplete) return { kind: "incomplete" };
	if (!stack) return null;
	const { targets, blocker } = assessPullRequestStack(stack);
	if (blocker) return blocker;
	const lowest = targets[0];
	if (stack.source === "inferred" && lowest && targets.length > 1) {
		return { kind: "not-a-stack", lowest: lowest.number };
	}
	return null;
}

/** The open layers of a chain, bottom to top: what a new GitHub stack would hold. */
export function stackableChain(
	stack: Pick<PullRequestStack, "layers" | "source">,
): number[] {
	if (stack.source !== "inferred") return [];
	const open = stack.layers.filter((layer) => layer.state === "open");
	return open.length >= 2 ? open.map((layer) => layer.number) : [];
}
