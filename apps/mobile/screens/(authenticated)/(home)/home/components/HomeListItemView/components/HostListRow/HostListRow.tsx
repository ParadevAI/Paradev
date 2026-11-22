import { View } from "react-native";
import type { HomeListItem } from "../../../../types";
import { WorkspaceRow } from "../../../WorkspaceRow";
import type { HomeListContext } from "../../HomeListItemView.types";

export function HostListRow({
	item,
	card,
	context,
}: {
	item: Extract<HomeListItem, { kind: "workspace" }>;
	card: boolean;
	context: HomeListContext;
}) {
	const { workspace, groups } = item;
	const folderTags = groups?.folderTags ?? [];
	const actions =
		groups && !item.offline ? context.folderActionsFor(groups.machineId) : null;
	const row = (
		<WorkspaceRow
			workspace={workspace}
			pullRequest={context.hostPullRequest(workspace)}
			diffStats={context.diffStats.get(workspace.id) ?? null}
			cache={context.cache}
			attention={context.attentionByWorkspace.get(workspace.id) ?? null}
			sessions={context.terminalsByWorkspace.get(workspace.id) ?? []}
			onCopied={context.onCopied}
			card={card}
			group={item.group}
			detail={item.detail}
			disabled={item.offline}
			separator={item.separator}
			stateInLabel={item.stateInLabel}
			groups={
				groups && actions
					? {
							options: groups.folders.map((folder) => ({
								tag: folder.tag,
								name: folder.name,
							})),
							current: item.folderTag ?? null,
							onMove: (tag) => actions.moveToFolder(workspace, folderTags, tag),
							onCreate: () =>
								void actions.createFolder(
									workspace,
									groups.projectId,
									folderTags,
								),
						}
					: undefined
			}
		/>
	);
	return item.offline ? (
		<View pointerEvents="none" className="opacity-50">
			{row}
		</View>
	) : (
		row
	);
}
