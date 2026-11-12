import { describe, expect, test } from "bun:test";
import type { PullRequestStackLayer } from "../../hooks/usePullRequestStack";
import {
	assessPullRequestStack,
	resolveStackMergeBlocker,
	stackableChain,
	stackLayerIssue,
} from "./assessPullRequestStack";

function layer(
	position: number,
	overrides: Partial<PullRequestStackLayer> = {},
): PullRequestStackLayer {
	return {
		position,
		number: 4176 + position,
		title: `Layer ${position}`,
		url: `https://github.com/o/r/pull/${4176 + position}`,
		state: "open",
		isDraft: false,
		headRefName: `billing/${position}`,
		headRefOid: `oid-${position}`,
		baseRefName: position === 1 ? "main" : `billing/${position - 1}`,
		mergeable: "mergeable",
		mergeStateStatus: "CLEAN",
		reviewDecision: null,
		queue: null,
		isCurrent: false,
		...overrides,
	};
}

/** Four layers viewed from layer 3, with overrides per position. */
function stackAt3(
	overrides: Record<number, Partial<PullRequestStackLayer>> = {},
) {
	return {
		currentPosition: 3,
		layers: [1, 2, 3, 4].map((position) =>
			layer(position, {
				isCurrent: position === 3,
				...overrides[position],
			}),
		),
	};
}

describe("stackLayerIssue", () => {
	test("names what blocks a layer, most decisive first", () => {
		const issue = (overrides: Partial<PullRequestStackLayer>) =>
			stackLayerIssue(layer(1, overrides));
		expect(issue({})).toBeNull();
		expect(issue({ state: "closed", isDraft: true })).toBe("closed");
		expect(issue({ isDraft: true, mergeable: "conflicting" })).toBe("draft");
		expect(issue({ mergeStateStatus: "DIRTY" })).toBe("conflicts");
		expect(
			issue({
				mergeStateStatus: "BLOCKED",
				reviewDecision: "changes_requested",
			}),
		).toBe("changes_requested");
		expect(
			issue({ mergeStateStatus: "BLOCKED", reviewDecision: "review_required" }),
		).toBe("review_required");
		expect(
			issue({ mergeStateStatus: "BLOCKED", reviewDecision: "approved" }),
		).toBe("blocked");
		expect(issue({ mergeStateStatus: "UNSTABLE" })).toBe("checks_failing");
		expect(issue({ mergeStateStatus: "BEHIND" })).toBe("behind");
		expect(issue({ mergeable: "unknown" })).toBe("pending");
	});

	test("has nothing to say about a merged or queued layer", () => {
		expect(
			stackLayerIssue(layer(1, { state: "merged", mergeStateStatus: null })),
		).toBeNull();
		expect(
			stackLayerIssue(
				layer(1, {
					mergeStateStatus: "BLOCKED",
					queue: { position: 1, state: "AWAITING_CHECKS" },
				}),
			),
		).toBeNull();
	});
});

describe("assessPullRequestStack", () => {
	test("targets the current layer and every unmerged layer below it", () => {
		const { targets, verdict } = assessPullRequestStack(
			stackAt3({ 1: { state: "merged" } }),
		);
		expect(targets.map((target) => target.position)).toEqual([2, 3]);
		expect(verdict).toBe("ready");
	});

	test("is merged when nothing below is left to merge", () => {
		const merged = { state: "merged" } as const;
		expect(
			assessPullRequestStack(stackAt3({ 1: merged, 2: merged, 3: merged })),
		).toMatchObject({ verdict: "merged", blocker: null });
	});

	test("is queued when every target is in the merge queue, at the front-most position", () => {
		const queued = (position: number) => ({
			queue: { position, state: "QUEUED" },
		});
		expect(
			assessPullRequestStack(
				stackAt3({ 1: queued(4), 2: queued(5), 3: queued(6) }),
			),
		).toMatchObject({ verdict: "queued", blocker: null });
	});

	test("needs attention for the first layer that blocks, bottom up", () => {
		expect(
			assessPullRequestStack(
				stackAt3({ 1: { isDraft: true }, 2: { state: "closed" } }),
			),
		).toMatchObject({
			verdict: "attention",
			blocker: { kind: "draft", number: 4177 },
		});
		expect(
			assessPullRequestStack(
				stackAt3({
					3: { mergeStateStatus: "BLOCKED", reviewDecision: "review_required" },
				}),
			).blocker,
		).toEqual({ kind: "review_required", number: 4179 });
	});

	test("ignores layers above the current one", () => {
		expect(
			assessPullRequestStack(stackAt3({ 4: { isDraft: true } })).verdict,
		).toBe("ready");
	});

	test("is mergeable with failing checks when a layer is unstable", () => {
		expect(
			assessPullRequestStack(
				stackAt3({
					1: { mergeStateStatus: "UNSTABLE" },
					2: { mergeable: "unknown" },
				}),
			),
		).toMatchObject({ verdict: "unstable", blocker: null });
	});

	test("is pending while GitHub has not computed a layer, or it is behind", () => {
		for (const overrides of [
			{ mergeable: "unknown" as const },
			{ mergeStateStatus: null },
			{ mergeStateStatus: "BEHIND" },
		]) {
			expect(assessPullRequestStack(stackAt3({ 2: overrides })).verdict).toBe(
				"pending",
			);
		}
	});
});

describe("resolveStackMergeBlocker", () => {
	test("passes a GitHub stack's blocker through", () => {
		expect(
			resolveStackMergeBlocker({
				...stackAt3({ 1: { isDraft: true } }),
				source: "github",
			}),
		).toEqual({ kind: "draft", number: 4177 });
	});

	test("never blocks a chain of base branches or a missing stack", () => {
		expect(
			resolveStackMergeBlocker({
				...stackAt3({ 1: { isDraft: true } }),
				source: "inferred",
			}),
		).toBeNull();
		expect(resolveStackMergeBlocker(null)).toBeNull();
	});
});

describe("stackableChain", () => {
	test("is the open layers of a chain, bottom to top", () => {
		expect(
			stackableChain({
				...stackAt3({ 1: { state: "merged" } }),
				source: "inferred",
			}),
		).toEqual([4178, 4179, 4180]);
	});

	test("is empty for a GitHub stack, or with fewer than two open layers", () => {
		expect(stackableChain({ ...stackAt3(), source: "github" })).toEqual([]);
		const merged = { state: "merged" } as const;
		expect(
			stackableChain({
				...stackAt3({ 1: merged, 2: merged, 3: merged }),
				source: "inferred",
			}),
		).toEqual([]);
	});
});
