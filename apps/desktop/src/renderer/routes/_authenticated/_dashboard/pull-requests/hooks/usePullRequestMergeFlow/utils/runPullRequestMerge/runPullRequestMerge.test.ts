import { expect, mock, test } from "bun:test";
import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "@superset/shared/pull-request-stack";
import type { BackgroundMergeOutcome } from "../../../../utils/pullRequestClient";
import {
	type PullRequestMergeOperations,
	PullRequestMergeRefusal,
	runPullRequestMerge,
} from "./runPullRequestMerge";

function layer(
	position: number,
	overrides: Partial<PullRequestStackLayer> = {},
): PullRequestStackLayer {
	return {
		position,
		number: 100 + position,
		title: `Layer ${position}`,
		url: `https://github.com/acme/app/pull/${100 + position}`,
		state: "open",
		isDraft: false,
		headRefName: `layer-${position}`,
		headRefOid: `head-${position}`,
		baseRefName: position === 1 ? "main" : `layer-${position - 1}`,
		mergeable: "mergeable",
		mergeStateStatus: "CLEAN",
		reviewDecision: "approved",
		queue: null,
		isCurrent: false,
		...overrides,
	};
}

function stackOf(layers: PullRequestStackLayer[]): PullRequestStack {
	const current = layers.find((entry) => entry.isCurrent);
	return {
		source: "github",
		stackNumber: 1,
		baseRefName: "main",
		layers,
		currentPosition: current?.position ?? layers.length,
		usesMergeQueue: false,
		restack: null,
	};
}

const twoLayers = stackOf([layer(1), layer(2, { isCurrent: true })]);

function operations(
	outcome: BackgroundMergeOutcome,
	fresh: PullRequestStack | null = twoLayers,
) {
	return {
		readStack: mock(async () => fresh),
		mergeInBackground: mock(async () => outcome),
		enqueue: mock(async () => {}),
		merge: mock(async () => {}),
	} satisfies PullRequestMergeOperations;
}

test("a stack merges at the head the fresh read saw", async () => {
	const ops = operations("merged");
	const outcome = await runPullRequestMerge(
		{ stack: twoLayers, usesQueue: false, method: "squash" },
		ops,
	);
	expect(outcome).toBe("merged");
	expect(ops.mergeInBackground).toHaveBeenCalledWith({
		mergeAction: "default",
		mergeMethod: "squash",
		sha: "head-2",
	});
});

test("a layer that merged since the dialog opened stops the merge", async () => {
	const ops = operations(
		"merged",
		stackOf([layer(1, { state: "merged" }), layer(2, { isCurrent: true })]),
	);
	await expect(
		runPullRequestMerge(
			{ stack: twoLayers, usesQueue: false, method: "squash" },
			ops,
		),
	).rejects.toMatchObject({ reason: "stack-changed" });
	expect(ops.mergeInBackground).not.toHaveBeenCalled();
});

test("a stack that was dissolved into a chain of the same pull requests stops the merge", async () => {
	const ops = operations("merged", {
		...twoLayers,
		source: "inferred",
		stackNumber: null,
	});
	await expect(
		runPullRequestMerge(
			{ stack: twoLayers, usesQueue: false, method: "squash" },
			ops,
		),
	).rejects.toMatchObject({ reason: "stack-changed" });
	expect(ops.mergeInBackground).not.toHaveBeenCalled();
});

test("a merge queue picks its own method", async () => {
	const ops = operations("enqueued");
	await runPullRequestMerge(
		{ stack: null, usesQueue: true, method: "squash" },
		ops,
	);
	expect(ops.mergeInBackground).toHaveBeenCalledWith({
		mergeAction: "default",
	});
});

test("without a background merge, one pull request joins the queue directly", async () => {
	const ops = operations("unavailable");
	const outcome = await runPullRequestMerge(
		{ stack: null, usesQueue: true, method: "squash" },
		ops,
	);
	expect(outcome).toBe("enqueued");
	expect(ops.enqueue).toHaveBeenCalledTimes(1);
	expect(ops.merge).not.toHaveBeenCalled();
});

test("without a background merge, one pull request merges the plain way", async () => {
	const ops = operations("unavailable");
	const outcome = await runPullRequestMerge(
		{ stack: null, usesQueue: false, method: "rebase" },
		ops,
	);
	expect(outcome).toBe("merged");
	expect(ops.merge).toHaveBeenCalledWith("rebase");
});

test("without a background merge, a stack of several is refused", async () => {
	const ops = operations("unavailable");
	const refusal = await runPullRequestMerge(
		{ stack: twoLayers, usesQueue: false, method: "squash" },
		ops,
	).catch((error: unknown) => error);
	expect(refusal).toBeInstanceOf(PullRequestMergeRefusal);
	expect(ops.merge).not.toHaveBeenCalled();
});
