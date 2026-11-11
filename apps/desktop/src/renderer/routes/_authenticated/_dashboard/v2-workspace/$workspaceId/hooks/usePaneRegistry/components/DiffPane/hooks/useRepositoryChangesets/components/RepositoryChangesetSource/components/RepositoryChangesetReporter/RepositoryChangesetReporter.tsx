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

interface RepositoryChangesetReporterProps {
	workspaceId: string;
	onChange: (workspaceId: string, changeset: RepositoryChangeset) => void;
}

/** Reports one checkout's changed files, in that checkout's own scope. */
export function RepositoryChangesetReporter({
	workspaceId,
	onChange,
}: RepositoryChangesetReporterProps) {
	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({
		workspaceId,
		ref,
		tagWorkspace: true,
	});
	useEffect(() => {
		onChange(workspaceId, { files, isLoading });
	}, [onChange, workspaceId, files, isLoading]);
	return null;
}
