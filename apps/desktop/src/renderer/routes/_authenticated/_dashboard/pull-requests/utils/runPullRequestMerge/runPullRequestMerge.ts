import type { MergeMethod } from "@superset/shared/pull-request-merge-methods";
import {
	type PullRequestStack,
	stackMergeTargets,
} from "@superset/shared/pull-request-stack";
import type {
	AsyncMergeRequest,
	BackgroundMergeOutcome,
} from "../pullRequestClient";

export interface PullRequestMergeOperations {
	/** The stack as GitHub has it now, never from a cache. */
	readStack: () => Promise<PullRequestStack | null>;
	mergeInBackground: (
		request: AsyncMergeRequest,
	) => Promise<BackgroundMergeOutcome>;
	enqueue: (sha?: string) => Promise<void>;
	merge: (method: MergeMethod) => Promise<void>;
}

/** The merge did not start, for a reason the person can act on. */
export class PullRequestMergeRefusal extends Error {
	constructor(readonly reason: "stack-changed" | "stack-needs-background") {
		super(reason);
		this.name = "PullRequestMergeRefusal";
	}
}

function targetNumbers(stack: PullRequestStack | null): string {
	return stack
		? stackMergeTargets(stack)
				.map((layer) => layer.number)
				.join(",")
		: "";
}

/**
 * Merges what the person confirmed. A stack is read again first, so a layer
 * that joined or left since the dialog opened stops the merge. Without
 * GitHub's background merge, one pull request still merges or joins the
 * queue the plain way; a stack of several cannot.
 */
export async function runPullRequestMerge(
	{
		stack,
		usesQueue,
		method,
	}: {
		stack: PullRequestStack | null;
		usesQueue: boolean;
		method: MergeMethod;
	},
	operations: PullRequestMergeOperations,
): Promise<BackgroundMergeOutcome> {
	let head: string | undefined;
	let targetCount = 1;
	if (stack) {
		const fresh = await operations.readStack();
		if (targetNumbers(fresh) !== targetNumbers(stack)) {
			throw new PullRequestMergeRefusal("stack-changed");
		}
		head = fresh?.layers.find((layer) => layer.isCurrent)?.headRefOid;
		targetCount = stackMergeTargets(stack).length;
	}
	const outcome = await operations.mergeInBackground({
		mergeAction: "default",
		...(usesQueue ? {} : { mergeMethod: method }),
		...(head ? { sha: head } : {}),
	});
	if (outcome !== "unavailable") return outcome;
	if (targetCount > 1) {
		throw new PullRequestMergeRefusal("stack-needs-background");
	}
	if (usesQueue) {
		await operations.enqueue(head);
		return "enqueued";
	}
	await operations.merge(method);
	return "merged";
}
