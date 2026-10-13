import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { StackMergeMethod } from "../../components/PullRequestStackMergeDialog";

/**
 * Lands a stacked PR and every open layer below it. GitHub may take a while
 * to settle a stack merge, so a loading toast stands in until it does.
 */
export function useMergePullRequestStack({
	projectId,
	hostUrl,
	prNumber,
	onMerged,
}: {
	projectId: string | null;
	hostUrl: string | null;
	prNumber: number | null;
	/** Refetches what the merge changed; the mutation stays pending until it resolves. */
	onMerged: () => Promise<unknown> | undefined;
}) {
	const { t } = useLingui();
	return useMutation({
		mutationFn: async (mergeMethod: StackMergeMethod) => {
			if (!hostUrl || !projectId || prNumber === null) {
				throw new Error(
					t({ message: "This project isn't linked to a GitHub repository." }),
				);
			}
			return getHostServiceClientByUrl(hostUrl).pullRequests.mergeStack.mutate({
				projectId,
				prNumber,
				mergeMethod,
			});
		},
		onMutate: () => ({
			toastId: toast.loading(t({ message: "Merging stack…" })),
		}),
		onSuccess: (result, _method, context) => {
			toast.success(
				result.outcome === "enqueued"
					? t({ message: "Stack added to merge queue" })
					: t({ message: "Stack merged" }),
				{ id: context?.toastId },
			);
			return onMerged();
		},
		onError: (error, _method, context) => {
			toast.error(t({ message: "Couldn't merge stack" }), {
				id: context?.toastId,
				description: errorMessage(error),
			});
		},
	});
}
