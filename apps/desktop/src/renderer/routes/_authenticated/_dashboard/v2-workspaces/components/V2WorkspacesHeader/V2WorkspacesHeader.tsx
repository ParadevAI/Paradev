import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuPlus } from "react-icons/lu";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { WorkItemsSearch } from "renderer/routes/_authenticated/_dashboard/components/WorkItemsSearch";
import type {
	V2WorkspaceCreatorOption,
	V2WorkspaceHostOption,
	V2WorkspaceProjectOption,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useV2WorkspacesFilterStore } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { V2WorkspacesFilterBar } from "./components/V2WorkspacesFilterBar";
import { V2WorkspacesViewsBar } from "./components/V2WorkspacesViewsBar";

interface V2WorkspacesHeaderProps {
	hostOptions: V2WorkspaceHostOption[];
	projectOptions: V2WorkspaceProjectOption[];
	creatorOptions: V2WorkspaceCreatorOption[];
	hostsById: Map<
		string,
		{ hostName: string; isOnline: boolean; isLocal: boolean }
	>;
	projectsById: Map<string, { projectName: string; iconUrl: string | null }>;
	/** Offers "Cloud" as a place; off when the org has no cloud workspaces. */
	cloudEnabled: boolean;
}

/** Title row, then the views, then the active view's filters as chips. */
export function V2WorkspacesHeader({
	hostOptions,
	projectOptions,
	creatorOptions,
	hostsById,
	projectsById,
	cloudEnabled,
}: V2WorkspacesHeaderProps) {
	const { t } = useLingui();
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const setSearchQuery = useV2WorkspacesFilterStore(
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
