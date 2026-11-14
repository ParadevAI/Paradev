import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import {
	type ChangesetFile,
	getChangesetFileRepositoryId,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { checkoutInput } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/checkoutInput";

/** Stages and unstages a file in its own checkout; an untagged file is in `repositoryId`. */
export function useStagingMutations(
	workspaceId: string,
	repositoryId: string | undefined,
) {
	const { t } = useLingui();
	const utils = workspaceTrpc.useUtils();
	const invalidate = (scope: {
		workspaceId: string;
		repositoryId?: string;
	}) => {
		const input = checkoutInput(scope.workspaceId, scope.repositoryId);
		void utils.git.getStatus.invalidate(input);
		void utils.git.getDiff.invalidate(input);
	};
	const { mutate: stage } = workspaceTrpc.git.stageFile.useMutation({
		onSuccess: (_data, variables) => invalidate(variables),
		onError: (err) => {
			toast.error(t({ message: "Couldn't stage file" }), {
				description: errorMessage(err),
			});
		},
	});
	const { mutate: unstage } = workspaceTrpc.git.unstageFile.useMutation({
		onSuccess: (_data, variables) => invalidate(variables),
		onError: (err) => {
			toast.error(t({ message: "Couldn't unstage file" }), {
				description: errorMessage(err),
			});
		},
	});

	const stageFile = useCallback(
		(file: ChangesetFile) =>
			stage({
				...checkoutInput(
					workspaceId,
					getChangesetFileRepositoryId(file, repositoryId),
				),
				filePath: file.path,
				oldPath: file.oldPath,
			}),
		[stage, workspaceId, repositoryId],
	);
	const unstageFile = useCallback(
		(file: ChangesetFile) =>
			unstage({
				...checkoutInput(
					workspaceId,
					getChangesetFileRepositoryId(file, repositoryId),
				),
				filePath: file.path,
				oldPath: file.oldPath,
			}),
		[unstage, workspaceId, repositoryId],
	);

	return { stageFile, unstageFile };
}
