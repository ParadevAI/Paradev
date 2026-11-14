import { useEffect } from "react";
import {
	type ChangesetFile,
	useChangeset,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";

export interface RepositoryChangeset {
	files: ChangesetFile[];
	isLoading: boolean;
}

interface RepositoryChangesetSourceProps {
	workspaceId: string;
	repositoryId: string;
	onChange: (repositoryId: string, changeset: RepositoryChangeset) => void;
}

/** Reports one checkout's changed files, in that checkout's own scope. */
export function RepositoryChangesetSource({
	workspaceId,
	repositoryId,
	onChange,
}: RepositoryChangesetSourceProps) {
	const ref = useSidebarDiffRef(workspaceId, repositoryId);
	const { files, isLoading } = useChangeset({
		workspaceId,
		repositoryId,
		ref,
		tagRepository: true,
	});
	useEffect(() => {
		onChange(repositoryId, { files, isLoading });
	}, [onChange, repositoryId, files, isLoading]);
	return null;
}
