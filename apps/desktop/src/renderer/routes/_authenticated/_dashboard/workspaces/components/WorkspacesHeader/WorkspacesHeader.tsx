import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuPlus } from "react-icons/lu";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type {
	WorkspaceCreatorOption,
	WorkspaceHostFilterOption,
	WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
import { useWorkspacesFilterStore } from "renderer/routes/_authenticated/_dashboard/workspaces/stores/workspacesFilterStore";
import { V2WorkspacesFilterBar } from "./components/V2WorkspacesFilterBar";
import { V2WorkspacesViewsBar } from "./components/V2WorkspacesViewsBar";

interface WorkspacesHeaderProps {
	hostOptions: WorkspaceHostFilterOption[];
	projectOptions: WorkspaceProjectOption[];
	creatorOptions: WorkspaceCreatorOption[];
	hostsById: Map<
		string,
		{ hostName: string; isOnline: boolean; isLocal: boolean }
	>;
	projectsById: Map<string, { projectName: string; iconUrl: string | null }>;
	/** Offers "Cloud" as a place; off when the org has no cloud workspaces. */
	cloudEnabled: boolean;
}

/** Title row, then the views, then the active view's filters as chips. */
export function WorkspacesHeader({
	hostOptions,
	projectOptions,
	creatorOptions,
	hostsById,
	projectsById,
	cloudEnabled,
}: WorkspacesHeaderProps) {
	const { t } = useLingui();
	const searchQuery = useWorkspacesFilterStore((state) => state.searchQuery);
	const setSearchQuery = useWorkspacesFilterStore(
		(state) => state.setSearchQuery,
	);
	const openNewWorkspace = useOpenNewWorkspace();

	return (
		<div
			data-workspaces-toolbar
			className="@container shrink-0 border-b border-border"
		>
			<PageHeader
				contentClassName="gap-3 px-6"
				start={
					<h1 className="text-lg font-semibold">
						<Trans>Workspaces</Trans>
					</h1>
				}
				end={
					<div className="flex min-w-0 items-center gap-2">
						<WorkItemsSearch
							value={searchQuery}
							onChange={setSearchQuery}
							placeholder={t({ message: "Search workspaces…" })}
							label={t({ message: "Search workspaces" })}
							containerClassName="w-56 @max-3xl:w-40"
						/>
						<Button
							size="sm"
							className="shrink-0"
							onClick={() => openNewWorkspace()}
						>
							<LuPlus className="size-3.5" />
							<Trans>Create workspace</Trans>
						</Button>
					</div>
				}
			/>
			<V2WorkspacesViewsBar cloudEnabled={cloudEnabled} />
			<V2WorkspacesFilterBar
				hostOptions={hostOptions}
				projectOptions={projectOptions}
				creatorOptions={creatorOptions}
				hostsById={hostsById}
				projectsById={projectsById}
				cloudEnabled={cloudEnabled}
			/>
		</div>
	);
}
