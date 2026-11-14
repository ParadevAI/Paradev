import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import type { FileStatus } from "renderer/routes/_authenticated/_dashboard/components/StatusIndicator";
import { useCheckoutGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import { useAreCheckoutsLoaded } from "../../state/activeRepositoryStore";
import { checkoutInput } from "../../utils/checkoutInput";
import { buildChangesetFiles } from "./buildChangesetFiles";
import type { ChangesetFile, DiffRef } from "./types";

interface UseChangesetArgs {
	workspaceId: string;
	repositoryId: string | undefined;
	ref: DiffRef;
	/** Tags each file with repositoryId, for views that mix repositories. */
	tagRepository?: boolean;
	enabled?: boolean;
}

interface UseChangesetResult {
	files: ChangesetFile[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
}

export function useChangeset({
	workspaceId,
	repositoryId,
	ref,
	tagRepository = false,
	enabled = true,
}: UseChangesetArgs): UseChangesetResult {
	const gitStatus = useCheckoutGitStatus(repositoryId);
	const scope = checkoutInput(workspaceId, repositoryId);
	const checkoutsLoaded = useAreCheckoutsLoaded(workspaceId);
	const commitQuery = workspaceTrpc.git.getCommitFiles.useQuery(
		ref.kind === "commit"
			? {
					...scope,
					commitHash: ref.commitHash,
					fromHash: ref.fromHash,
				}
			: { ...scope, commitHash: "" },
		{
			enabled: enabled && checkoutsLoaded && ref.kind === "commit",
			staleTime: Number.POSITIVE_INFINITY,
		},
	);

	const untaggedFiles = useMemo<ChangesetFile[]>(() => {
		if (ref.kind === "commit") {
			return (commitQuery.data?.files ?? []).map((file) => ({
				path: file.path,
				oldPath: file.oldPath,
				status: file.status as FileStatus,
				additions: file.additions,
				deletions: file.deletions,
				isBinary: file.isBinary,
				source: {
					kind: "commit",
					commitHash: ref.commitHash,
					fromHash: ref.fromHash,
				},
			}));
		}

		const status = gitStatus.data;
		if (!status) return [];

		return buildChangesetFiles(status, ref);
	}, [ref, gitStatus.data, commitQuery.data?.files]);
	const files = useMemo(
		() =>
			tagRepository && repositoryId
				? untaggedFiles.map((file) => ({ ...file, repositoryId }))
				: untaggedFiles,
		[untaggedFiles, tagRepository, repositoryId],
	);

	const activeQuery = ref.kind === "commit" ? commitQuery : gitStatus;

	return {
		files,
		isLoading: activeQuery.isLoading,
		isError: activeQuery.isError,
		error: activeQuery.error,
	};
}
