import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { checkoutInput } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/checkoutInput";

export function useStagingMutations(
	workspaceId: string,
	repositoryId: string | undefined,
) {
	const { t } = useLingui();
	const utils = workspaceTrpc.useUtils();
	const invalidate = () => {
		void utils.git.getStatus.invalidate(
			checkoutInput(workspaceId, repositoryId),
		);
		void utils.git.getDiff.invalidate(checkoutInput(workspaceId, repositoryId));
	};
	const { mutate: stage } = workspaceTrpc.git.stageFile.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error(t({ message: "Couldn't stage file" }), {
				description: errorMessage(err),
			});
		},
	});
	const { mutate: unstage } = workspaceTrpc.git.unstageFile.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error(t({ message: "Couldn't unstage file" }), {
				description: errorMessage(err),
			});
		},
	});

	const stageFile = useCallback(
		(file: ChangesetFile) =>
			stage({
				...checkoutInput(workspaceId, repositoryId),
				filePath: file.path,
				oldPath: file.oldPath,
			}),
		[stage, workspaceId, repositoryId],
	);
	const unstageFile = useCallback(
		(file: ChangesetFile) =>
			unstage({
				...checkoutInput(workspaceId, repositoryId),
				filePath: file.path,
				oldPath: file.oldPath,
			}),
		[unstage, workspaceId, repositoryId],
	);

	return { stageFile, unstageFile };
}
