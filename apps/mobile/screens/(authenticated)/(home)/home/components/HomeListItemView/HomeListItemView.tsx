import * as Haptics from "expo-haptics";
import { Box } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import type { HomeListItem } from "../../types";
import { NO_PROJECT_SECTION_ID } from "../../utils/buildHostSection";
import { CloudWorkspaceRow } from "../CloudWorkspaceRow";
import { FolderSectionHeader } from "../FolderSectionHeader";
import { HostLabel } from "../HostLabel";
import { HostOfflineView } from "../HostOfflineView";
import { PlaceEmptyNote } from "../PlaceEmptyNote";
import { ProjectSectionHeader } from "../ProjectSectionHeader";
import { SectionLabel } from "../SectionLabel";
import { HostListRow } from "./components/HostListRow";
import type { HomeListContext } from "./HomeListItemView.types";

const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export function HomeListItemView({
	item,
	card,
	context,
}: {
	item: HomeListItem;
	/** A cell of the wide grid rather than a row of the list. */
	card: boolean;
	context: HomeListContext;
}) {
	switch (item.kind) {
		case "sectionLabel":
			return <SectionLabel label={item.label} first={item.first} />;
		case "placeEmpty":
			return <PlaceEmptyNote label={item.label} />;
		case "placeLabel":
			return (
				<HostLabel
					name={item.name}
					status={item.status}
					lastSeenAt={item.lastSeenAt}
					onRetry={item.retry ? context.onRetryPresence : undefined}
					first={item.first}
					collapsed={item.collapsed}
					count={item.count}
					attention={item.attention}
					onToggle={
						item.collapsible
							? () => {
									tap();
									context.onTogglePlace(item.placeId);
								}
							: undefined
					}
				/>
			);
		case "cloudRow":
			return (
				<CloudWorkspaceRow
					row={item.row}
					pullRequest={context.cloudPullRequest(item.row.id)}
					viewerId={context.viewerId}
					cache={context.cloudCache}
					onCopied={context.onCopied}
					card={card}
					detail={item.detail}
					grouped={item.grouped}
					separator={item.separator}
					stateInLabel={item.stateInLabel}
				/>
			);
		case "hostOffline":
			return (
				<View className="py-16">
					<HostOfflineView
						hostName={item.hostName}
						lastSeenAt={item.lastSeenAt}
					/>
				</View>
			);
		case "folderHeader": {
			const { folder } = item;
			const hostGroup = item.groups ? item : null;
			const actions =
				hostGroup && !item.offline
					? context.folderActionsFor(item.machineId)
					: null;
			return (
				<View className={item.offline ? "opacity-50" : undefined}>
					<FolderSectionHeader
						name={folder.name}
						color={folder.color}
						bar={item.bar}
						count={folder.workspaces.length}
						collapsed={item.collapsed}
						attention={item.attention}
						onToggle={() => {
							tap();
							context.onToggleSection(item.machineId, folder.key);
						}}
						menu={
							hostGroup && actions
								? {
										onRename: () =>
											void actions.renameFolder(
												hostGroup.groups.projectId,
												hostGroup.folder,
											),
										onSetColor: (color) =>
											actions.setFolderColor(
												hostGroup.groups.projectId,
												hostGroup.folder,
												color,
											),
										onDelete: () =>
											void actions.deleteFolder(
												hostGroup.groups.projectId,
												hostGroup.folder,
												hostGroup.groups.workspaces,
											),
									}
								: undefined
						}
					/>
				</View>
			);
		}
		case "projectHeader": {
			const isNoProject = item.projectId === NO_PROJECT_SECTION_ID;
			return (
				<View className={item.offline ? "opacity-50" : undefined}>
					<ProjectSectionHeader
						name={item.name}
						iconUrl={item.iconUrl}
						icon={
							isNoProject ? (
								<Icon as={Box} className="text-muted-foreground size-4" />
							) : undefined
						}
						count={item.count}
						collapsed={item.collapsed}
						attention={item.attention}
						afterLabel={item.afterLabel}
						onToggle={() => {
							tap();
							context.onToggleSection(item.machineId, item.projectId);
						}}
						onNewWorkspace={
							item.offline || item.cloud
								? undefined
								: () => {
										tap();
										context.onNewWorkspace(
											isNoProject ? null : item.projectId,
											item.machineId,
										);
									}
						}
					/>
				</View>
			);
		}
		case "workspace":
			return <HostListRow item={item} card={card} context={context} />;
	}
}
