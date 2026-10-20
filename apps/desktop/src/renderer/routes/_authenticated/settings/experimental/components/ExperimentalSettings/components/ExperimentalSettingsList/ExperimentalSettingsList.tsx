import { Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useNewDashboardSidebarEnabled } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNewDashboardSidebarEnabled";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import {
	useInlineWorkspacePortsStore,
	usePortsDisplayMode,
} from "renderer/stores/inline-workspace-ports";
import { useNewDashboardSidebarStore } from "renderer/stores/new-dashboard-sidebar";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import {
	useWorkspaceAgentsRowEnabled,
	useWorkspaceAgentsRowStore,
} from "renderer/stores/workspace-agents-row";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../../../utils/settings-search";
import { WaitForSetupBeforeAgentSetting } from "../WaitForSetupBeforeAgentSetting";

interface ExperimentalSettingsListProps {
	visibleItems?: SettingItemId[] | null;
	isV2OnlyUser: boolean;
}

export function ExperimentalSettingsList({
	visibleItems,
	isV2OnlyUser,
}: ExperimentalSettingsListProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const showV1Migration = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		visibleItems,
	);
	const showInlineWorkspacePorts = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS,
		visibleItems,
	);
	const showWorkspaceAgents = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS,
		visibleItems,
	);
	const cloudWorkspacesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const showNewSidebar =
		cloudWorkspacesEnabled &&
		isItemVisible(SETTING_ITEM_ID.EXPERIMENTAL_NEW_SIDEBAR, visibleItems);
	const newSidebarEnabled = useNewDashboardSidebarEnabled();
	const setNewSidebarEnabled = useNewDashboardSidebarStore(
		(state) => state.setEnabled,
	);
	const showWaitForSetupBeforeAgent = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_WAIT_FOR_SETUP_BEFORE_AGENT,
		visibleItems,
	);
	const openV1ImportModal = useOpenV1ImportModal();
	const portsDisplayMode = usePortsDisplayMode();
	const setPortsDisplayMode = useInlineWorkspacePortsStore(
		(state) => state.setMode,
	);
	const workspaceAgentsEnabled = useWorkspaceAgentsRowEnabled();
	const setWorkspaceAgentsEnabled = useWorkspaceAgentsRowStore(
		(state) => state.setEnabled,
	);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Experimental</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans>Try early access features and previews.</Trans>
				</p>
			</div>

			<div className="space-y-6">
				{showV1Migration && !isV2OnlyUser && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">
								<HighlightText
									text={t({
										message: "Import from v1",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<HighlightText
									text={t({
										message:
											"Bring v1 projects, workspaces, and terminal scripts over to v2. Each item is imported individually and can be retried.",
									})}
									query={searchQuery}
								/>
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => openV1ImportModal()}
							className="shrink-0"
						>
							<Trans>Open importer</Trans>
						</Button>
					</div>
				)}
				{showInlineWorkspacePorts && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label
								htmlFor="inline-workspace-ports"
								className="text-sm font-medium"
							>
								<HighlightText
									text={t({
										message: "Ports in top bar dropdown",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<HighlightText
									text={t({
										message:
											"Show detected ports as a dropdown in the top bar instead of a chip under each workspace in the sidebar.",
									})}
									query={searchQuery}
								/>
							</p>
						</div>
						<Switch
							id="inline-workspace-ports"
							checked={portsDisplayMode === "topbar"}
							onCheckedChange={(checked) =>
								setPortsDisplayMode(checked ? "topbar" : "inline")
							}
						/>
					</div>
				)}
				{showWorkspaceAgents && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="workspace-agents" className="text-sm font-medium">
								<HighlightText
									text={t({
										message: "Workspace agents",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<HighlightText
									text={t({
										message:
											"Show running agents under each workspace in the sidebar, with their live status.",
									})}
									query={searchQuery}
								/>
							</p>
						</div>
						<Switch
							id="workspace-agents"
							checked={workspaceAgentsEnabled}
							onCheckedChange={setWorkspaceAgentsEnabled}
						/>
					</div>
				)}
				{showNewSidebar && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="new-sidebar" className="text-sm font-medium">
								<HighlightText
									text={t({
										message: "New sidebar",
									})}
									query={searchQuery}
								/>
							</Label>
							<p className="text-xs text-muted-foreground">
								<HighlightText
									text={t({
										message:
											"Cloud workspaces under their projects, a local and cloud filter, and the redesigned workspace row.",
									})}
									query={searchQuery}
								/>
							</p>
						</div>
						<Switch
							id="new-sidebar"
							checked={newSidebarEnabled}
							onCheckedChange={setNewSidebarEnabled}
						/>
					</div>
				)}
				{showWaitForSetupBeforeAgent && <WaitForSetupBeforeAgentSetting />}
			</div>
		</div>
	);
}
