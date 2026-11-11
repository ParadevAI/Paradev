import { WorkspaceGitStatusProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import type { ChangesContentParams } from "../../../../hooks/useChangesContent";
import { RepositoryChanges } from "./components/RepositoryChanges";

interface RepositoryChangesSectionProps
	extends Omit<ChangesContentParams, "workspaceId"> {
	repository: { id: string; name: string; branch: string };
	onCountChange: (repositoryId: string, count: number) => void;
}

export function RepositoryChangesSection(props: RepositoryChangesSectionProps) {
	return (
		<WorkspaceGitStatusProvider workspaceId={props.repository.id}>
			<RepositoryChanges {...props} />
		</WorkspaceGitStatusProvider>
	);
}
