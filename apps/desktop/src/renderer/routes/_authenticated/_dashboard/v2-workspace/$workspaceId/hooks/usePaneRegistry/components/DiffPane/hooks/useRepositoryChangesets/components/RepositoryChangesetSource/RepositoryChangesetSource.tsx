import { WorkspaceGitStatusProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import {
	type RepositoryChangeset,
	RepositoryChangesetReporter,
} from "./components/RepositoryChangesetReporter";

interface RepositoryChangesetSourceProps {
	workspaceId: string;
	onChange: (workspaceId: string, changeset: RepositoryChangeset) => void;
}

export function RepositoryChangesetSource({
	workspaceId,
	onChange,
}: RepositoryChangesetSourceProps) {
	return (
		<WorkspaceGitStatusProvider workspaceId={workspaceId}>
			<RepositoryChangesetReporter
				workspaceId={workspaceId}
				onChange={onChange}
			/>
		</WorkspaceGitStatusProvider>
	);
}
