import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "../../hooks/usePullRequestStack";

export type PullRequestStackVerdict =
	| "merged"
	| "attention"
	| "unstable"
	| "pending"
	| "ready";

export type PullRequestStackBlocker =
	| { kind: "closed"; number: number }
	| { kind: "draft"; number: number }
	| { kind: "not-ready"; number: number };

export type PullRequestStackMergeBlocker =
	| PullRequestStackBlocker
	| { kind: "incomplete" }
	| { kind: "lower-layer"; number: number };

export interface PullRequestStackAssessment {
	verdict: PullRequestStackVerdict;
	/** What a merge of the current layer lands, trunk-most first. */
	targets: PullRequestStackLayer[];
	blocker: PullRequestStackBlocker | null;
}

const NOT_READY_STATES = new Set(["BLOCKED", "DIRTY", "DRAFT"]);
const PENDING_STATES = new Set(["BEHIND", "UNKNOWN"]);

export function stackMergeTargets(
	stack: Pick<PullRequestStack, "layers" | "currentPosition">,
): PullRequestStackLayer[] {
	return stack.layers.filter(
		(layer) =>
			layer.position <= stack.currentPosition && layer.state !== "merged",
	);
}

/** One verdict over the layers a merge would land; the first rule that matches wins. */
export function assessPullRequestStack(
	stack: Pick<PullRequestStack, "layers" | "currentPosition">,
): PullRequestStackAssessment {
	const targets = stackMergeTargets(stack);
	const assessment = (
		verdict: PullRequestStackVerdict,
		blocker: PullRequestStackBlocker | null = null,
	) => ({ verdict, targets, blocker });

	if (targets.length === 0) return assessment("merged");

	const closed = targets.find((layer) => layer.state === "closed");
	if (closed) {
		return assessment("attention", { kind: "closed", number: closed.number });
	}
	const draft = targets.find((layer) => layer.isDraft);
	if (draft) {
		return assessment("attention", { kind: "draft", number: draft.number });
	}
	const notReady = targets.find(
		(layer) =>
			layer.mergeable === "conflicting" ||
			NOT_READY_STATES.has(layer.mergeStateStatus ?? ""),
	);
	if (notReady) {
		return assessment("attention", {
			kind: "not-ready",
			number: notReady.number,
		});
	}

	if (targets.some((layer) => layer.mergeStateStatus === "UNSTABLE")) {
		return assessment("unstable");
	}
	if (
		targets.some(
			(layer) =>
				layer.mergeable === "unknown" ||
				layer.mergeStateStatus === null ||
				PENDING_STATES.has(layer.mergeStateStatus),
		)
	) {
		return assessment("pending");
	}
	return assessment("ready");
}

/**
 * Why a stack merge cannot run now, or null when it can. A chain inferred
 * from base branches has no stack on GitHub, so only its lowest open layer
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
		return { kind: "lower-layer", number: lowest.number };
	}
	return null;
}
