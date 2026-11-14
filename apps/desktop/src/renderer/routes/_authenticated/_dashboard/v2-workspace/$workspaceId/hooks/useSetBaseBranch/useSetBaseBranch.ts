import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { checkoutInput } from "../../utils/checkoutInput";

/** Sets a checkout's base branch and refreshes that checkout's diff. */
export function useSetBaseBranch(): (input: {
	workspaceId: string;
	repositoryId?: string;
	baseBranch: string | null;
}) => void {
	const { t } = useLingui();
	const utils = workspaceTrpc.useUtils();
	const mutation = workspaceTrpc.git.setBaseBranch.useMutation({
		onSuccess: (_data, variables) => {
			const changed = checkoutInput(
				variables.workspaceId,
				variables.repositoryId,
			);
			void utils.git.getBaseBranch.invalidate(changed);
			void utils.git.getStatus.invalidate(changed);
			void utils.git.listCommits.invalidate(changed);
			void utils.git.getDiff.invalidate(changed);
		},
		// The picker re-renders from getBaseBranch, so a rejected change
		// silently snaps back without this.
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to change base branch" })),
			),
	});
	const { mutate } = mutation;
	return useCallback((input) => mutate(input), [mutate]);
}
