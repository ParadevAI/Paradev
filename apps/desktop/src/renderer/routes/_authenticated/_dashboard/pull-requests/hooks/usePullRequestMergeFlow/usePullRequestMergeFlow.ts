import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { MergeMethod } from "@superset/shared/pull-request-merge-methods";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	assessPullRequestStack,
	type PullRequestStackAssessment,
	type PullRequestStackMergeBlocker,
	resolveStackMergeBlocker,
	stackableChain,
} from "../../utils/assessPullRequestStack";
import {
	type BackgroundMergeOutcome,
	createPullRequestStack,
	dequeuePullRequest,
	enqueuePullRequest,
	mergeInBackground,
	mergePullRequest,
	type PullRequestTarget,
	pullRequestStackQueryKey,
	readPullRequestStack,
} from "../../utils/pullRequestClient";
import {
	pullRequestDetailQueryKey,
	pullRequestDetailQueryOptions,
	useInvalidatePullRequestDetail,
} from "../usePullRequestDetail";
import {
	PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
	type PullRequestStack,
	type PullRequestStackQuery,
	usePullRequestStack,
	useStackedPullRequestsEnabled,
} from "../usePullRequestStack";
import {
	type MergeActionKind,
	usePullRequestStackCopy,
} from "../usePullRequestStackCopy";
import {
	PullRequestMergeRefusal,
	runPullRequestMerge,
} from "./utils/runPullRequestMerge";

export interface PullRequestMergeFlow {
	stackQuery: PullRequestStackQuery;
	stack: PullRequestStack | null;
	assessment: PullRequestStackAssessment | null;
	/** The pull request sits in a stack, so GitHub merges it as part of one. */
	isStack: boolean;
	kind: MergeActionKind;
	usesQueue: boolean;
	queued: { position: number | null } | null;
	/** How many pull requests the merge lands, when it lands several. */
	count: number | null;
	blocker: PullRequestStackMergeBlocker | null;
	/** False: the caller merges the one pull request itself. */
	handlesMerge: boolean;
	/** The chain's open pull requests, when they can become a GitHub stack. */
	chain: number[];
	isMerging: boolean;
	isDequeuing: boolean;
	isCreatingStack: boolean;
	confirm: { method: MergeMethod } | null;
	request: (method: MergeMethod) => void;
	cancel: () => void;
	run: () => void;
	/** Asks first: leaving the queue also takes the stacked layers above out. */
	dequeue: () => void;
	confirmsDequeue: boolean;
	cancelDequeue: () => void;
	runDequeue: () => void;
	createStack: () => void;
}

/** GitHub outlasted the polling: look again a few times so the page catches up. */
const PENDING_MERGE_REFRESH_DELAYS_MS = [30_000, 120_000, 300_000];

export function usePullRequestMergeFlow({
	target,
	onMerged,
}: {
	target: PullRequestTarget | null;
	/** Refetches what the merge changed; the action stays busy until it resolves. */
	onMerged?: () => Promise<unknown> | unknown;
}): PullRequestMergeFlow {
	const { t } = useLingui();
	const copy = usePullRequestStackCopy();
	const queryClient = useQueryClient();
	const isEnabled = useStackedPullRequestsEnabled();
	const stackQuery = usePullRequestStack(target);
	const invalidate = useInvalidatePullRequestDetail(target);
	// Read from the cache only: the pull request page and the merge menus load
	// the detail themselves.
	const { data: detailQueue } = useQuery({
		...pullRequestDetailQueryOptions({
			organizationId: target?.organizationId ?? null,
			repoFullName: target?.repoFullName ?? null,
			prNumber: target?.prNumber ?? null,
		}),
		enabled: false,
		select: (detail) => detail.mergeQueue ?? null,
	});
	const [confirm, setConfirm] = useState<{ method: MergeMethod } | null>(null);
	const [confirmsDequeue, setConfirmsDequeue] = useState(false);

	const stack = stackQuery.stack;
	const assessment = useMemo(
		() => (stack ? assessPullRequestStack(stack) : null),
		[stack],
	);
	const targetCount = assessment?.targets.length ?? 0;
	const isStack = stack?.source === "github";
	const usesQueue =
		isEnabled && (stack ? stack.usesMergeQueue : detailQueue?.enabled === true);
	const queued = !isEnabled
		? null
		: stack
			? (stack.layers.find((layer) => layer.isCurrent)?.queue ?? null)
			: (detailQueue?.entry ?? null);
	const blocker = resolveStackMergeBlocker(stack);
	const landsSeveral = isStack && targetCount > 1;
	const kind: MergeActionKind = { stack: landsSeveral, queue: usesQueue };

	const refresh = async () => {
		await onMerged?.();
		await invalidate();
		for (const layer of assessment?.targets ?? []) {
			if (!target || layer.number === target.prNumber) continue;
			void queryClient.invalidateQueries({
				queryKey: pullRequestDetailQueryKey(target.repoFullName, layer.number),
			});
		}
	};

	const merge = useMutation({
		mutationFn: async (
			method: MergeMethod,
		): Promise<BackgroundMergeOutcome> => {
			if (!target) {
				throw new Error(
					t({
						message: "This pull request has no GitHub access to act through.",
					}),
				);
			}
			try {
				return await runPullRequestMerge(
					{ stack: isStack ? stack : null, usesQueue, method },
					{
						readStack: () =>
							queryClient.fetchQuery({
								queryKey: pullRequestStackQueryKey(target),
								queryFn: () => readPullRequestStack(target),
								staleTime: 0,
							}),
						mergeInBackground: (request) => mergeInBackground(target, request),
						enqueue: (sha) => enqueuePullRequest(target, sha),
						merge: (mergeMethod) => mergePullRequest(target, { mergeMethod }),
					},
				);
			} catch (error) {
				if (!(error instanceof PullRequestMergeRefusal)) throw error;
				throw new Error(
					error.reason === "stack-changed"
						? t({
								message:
									"The stack changed while this was open. Check it and try again.",
							})
						: t({
								message: "GitHub cannot merge this stack in one step here.",
							}),
				);
			}
		},
		onMutate: () => ({ toastId: toast.loading(copy.busy(kind)) }),
		onSuccess: async (outcome, _method, context) => {
			const id = context?.toastId;
			if (outcome === "pending") {
				toast.message(
					t({
						message: "GitHub is still merging. This updates when it finishes.",
					}),
					{ id },
				);
				for (const delay of PENDING_MERGE_REFRESH_DELAYS_MS) {
					setTimeout(() => void refresh(), delay);
				}
			} else if (outcome === "enqueued") {
				toast.success(
					landsSeveral
						? t({ message: "Stack added to merge queue" })
						: t({ message: "Added to merge queue" }),
					{ id },
				);
			} else {
				toast.success(
					landsSeveral
						? t({ message: "Stack merged" })
						: t({ message: "Pull request merged" }),
					{ id },
				);
			}
			await refresh();
		},
		onError: (error, _method, context) => {
			toast.error(
				landsSeveral
					? t({ message: "Couldn't merge stack" })
					: t({ message: "Couldn't merge pull request" }),
				{ id: context?.toastId, description: errorMessage(error) },
			);
		},
	});

	const leaveQueue = useMutation({
		mutationFn: async () => {
			if (!target) return;
			await dequeuePullRequest(target);
		},
		onSuccess: async () => {
			toast.success(t({ message: "Removed from the merge queue" }));
			await refresh();
		},
		onError: (error) => {
			toast.error(t({ message: "Couldn't remove from the merge queue" }), {
				description: errorMessage(error),
			});
		},
	});

	const chain = useMemo(() => (stack ? stackableChain(stack) : []), [stack]);
	const create = useMutation({
		mutationFn: async () => {
			if (!target || chain.length < 2) return;
			await createPullRequestStack(target, chain);
		},
		onSuccess: async () => {
			toast.success(t({ message: "GitHub stack created" }));
			await queryClient.invalidateQueries({
				queryKey: PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
			});
		},
		onError: (error) => {
			const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
			toast.error(t({ message: "Couldn't create stack" }), {
				description:
					code === "NOT_FOUND"
						? t({
								message: "GitHub stacks are not turned on for this repository.",
							})
						: errorMessage(error),
			});
		},
	});

	return {
		stackQuery,
		stack,
		assessment,
		isStack,
		kind,
		usesQueue,
		queued,
		count: landsSeveral ? targetCount : null,
		blocker,
		handlesMerge: isStack || usesQueue,
		chain,
		isMerging: merge.isPending,
		isDequeuing: leaveQueue.isPending,
		isCreatingStack: create.isPending,
		confirm,
		request: (method) => {
			if (blocker === null) setConfirm({ method });
		},
		cancel: () => setConfirm(null),
		run: () => {
			if (!confirm) return;
			setConfirm(null);
			merge.mutate(confirm.method);
		},
		dequeue: () => setConfirmsDequeue(true),
		confirmsDequeue,
		cancelDequeue: () => setConfirmsDequeue(false),
		runDequeue: () => {
			if (!confirmsDequeue || leaveQueue.isPending) return;
			setConfirmsDequeue(false);
			leaveQueue.mutate();
		},
		createStack: () => create.mutate(),
	};
}
