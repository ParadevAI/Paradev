import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMutation } from "@tanstack/react-query";
import {
	mergePullRequest,
	type PullRequestMergeMethod,
	type PullRequestTarget,
	setPullRequestDraft,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";

export function usePullRequestActions({
	workspaceId,
	target,
	onRefresh,
}: {
	workspaceId: string;
	target: PullRequestTarget | null;
	onRefresh?: () => void;
}) {
	const { t } = useLingui();
	// Triggers a GitHub→host-service-DB sync for this workspace's PR. Without
	// this, post-merge UI state lags by up to ~30s waiting for the next
	// background sync tick. Called after a successful merge before refetching
	// the local query.
	const refreshPRMutation =
		workspaceTrpc.pullRequests.refreshByWorkspaces.useMutation();

	const mergePRMutation = useMutation({
		mutationFn: (mergeMethod: PullRequestMergeMethod) => {
			if (!target) throw new Error("No pull request to merge");
			return mergePullRequest(target, { mergeMethod });
		},
		onMutate: () => {
			const toastId = toast.loading(t({ message: "Merging PR..." }));
			return { toastId };
		},
		onSuccess: async (_data, _variables, context) => {
			toast.success(t({ message: "PR merged" }), { id: context?.toastId });
			try {
				await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
			} catch (error) {
				console.warn("Failed to refresh PR state after merge", error);
				toast.warning(
					t({
						message:
							"Merged, but couldn't refresh PR state — try again in a moment",
					}),
				);
			} finally {
				onRefresh?.();
			}
		},
		onError: (error, _variables, context) => {
			toast.error(
				t({
					message: `Merge failed: ${error.message}`,
				}),
				{ id: context?.toastId },
			);
		},
	});

	const markReadyMutation = useMutation({
		mutationFn: () => {
			if (!target) throw new Error("No pull request to mark ready");
			return setPullRequestDraft(target, false);
		},
		onMutate: () => {
			const toastId = toast.loading(
				t({
					message: "Marking ready for review...",
				}),
			);
			return { toastId };
		},
		onSuccess: async (_data, _variables, context) => {
			toast.success(
				t({
					message: "PR ready for review",
				}),
				{ id: context?.toastId },
			);
			try {
				await refreshPRMutation.mutateAsync({ workspaceIds: [workspaceId] });
			} catch (error) {
				console.warn("Failed to refresh PR state after marking ready", error);
				toast.warning(
					t({
						message:
							"Marked ready, but couldn't refresh PR state — try again in a moment",
					}),
				);
			} finally {
				onRefresh?.();
			}
		},
		onError: (error, _variables, context) => {
			toast.error(
				t({
					message: `Ready for review failed: ${error.message}`,
				}),
				{ id: context?.toastId },
			);
		},
	});

	return {
		merge: (mergeMethod: PullRequestMergeMethod) =>
			mergePRMutation.mutate(mergeMethod),
		markReady: () => markReadyMutation.mutate(),
		isMerging: mergePRMutation.isPending,
		isMarkingReady: markReadyMutation.isPending,
	};
}
