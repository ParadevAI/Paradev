import { describe, expect, test } from "bun:test";
import type { PullRequestStackLayer } from "../../hooks/usePullRequestStack";
import {
	assessPullRequestStack,
	resolveStackMergeBlocker,
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
		isQueued: false,
		headRefName: `billing/${position}`,
		baseRefName: position === 1 ? "main" : `billing/${position - 1}`,
		mergeable: "mergeable",
		mergeStateStatus: "CLEAN",
		isCurrent: false,
		workspaceId: null,
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

	test("needs attention for a closed layer before anything else", () => {
		expect(
			assessPullRequestStack(
				stackAt3({ 1: { isDraft: true }, 2: { state: "closed" } }),
			),
		).toMatchObject({
			verdict: "attention",
			blocker: { kind: "closed", number: 4178 },
		});
	});

	test("needs attention for a draft", () => {
		expect(
			assessPullRequestStack(stackAt3({ 2: { isDraft: true } })).blocker,
		).toEqual({ kind: "draft", number: 4178 });
	});

	test("needs attention for a conflicting, blocked or dirty layer", () => {
		for (const overrides of [
			{ mergeable: "conflicting" as const },
			{ mergeStateStatus: "BLOCKED" },
			{ mergeStateStatus: "DIRTY" },
		]) {
			expect(
				assessPullRequestStack(stackAt3({ 3: overrides })).blocker,
			).toEqual({ kind: "not-ready", number: 4179 });
		}
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

	test("is pending while GitHub has not computed a layer", () => {
		for (const overrides of [
			{ mergeable: "unknown" as const },
			{ mergeStateStatus: null },
			{ mergeStateStatus: "BEHIND" },
			{ mergeStateStatus: "UNKNOWN" },
		]) {
			expect(assessPullRequestStack(stackAt3({ 2: overrides })).verdict).toBe(
				"pending",
			);
		}
	});
});

describe("resolveStackMergeBlocker", () => {
	test("blocks every merge while the stack could not be read", () => {
		expect(
			resolveStackMergeBlocker({ stack: null, isIncomplete: true }),
		).toEqual({ kind: "incomplete" });
	});

	test("passes the verdict's blocker through", () => {
		expect(
			resolveStackMergeBlocker({
				stack: { ...stackAt3({ 1: { isDraft: true } }), source: "github" },
				isIncomplete: false,
			}),
		).toEqual({ kind: "draft", number: 4177 });
	});

	test("lets an inferred chain merge only its lowest open layer", () => {
		expect(
			resolveStackMergeBlocker({
				stack: { ...stackAt3(), source: "inferred" },
				isIncomplete: false,
			}),
		).toEqual({ kind: "lower-layer", number: 4177 });
		expect(
			resolveStackMergeBlocker({
				stack: {
					...stackAt3({ 1: { state: "merged" }, 2: { state: "merged" } }),
					source: "inferred",
				},
				isIncomplete: false,
			}),
		).toBeNull();
		expect(
			resolveStackMergeBlocker({
				stack: { ...stackAt3(), source: "github" },
				isIncomplete: false,
			}),
		).toBeNull();
	});
});
