import { useLingui } from "@lingui/react/macro";
import { Alert } from "react-native";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Text } from "@/components/ui/text";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import { itemFromCloudRow } from "@/hooks/useCloudWorkspaceItems";
import { useWorkspaceRowActions } from "../../../WorkspaceRow/hooks/useWorkspaceRowActions";
import type { ArchivedCloudRowMenuProps } from "./ArchivedCloudRowMenu.types";

export function ArchivedCloudRowMenu({
	row,
	cache,
	onCopied,
	children,
}: ArchivedCloudRowMenuProps) {
	const { t } = useLingui();
	const { unarchive } = useCloudWorkspaceActions();
	const { copyId, shareWorkspace } = useWorkspaceRowActions(
		itemFromCloudRow(row),
		cache,
		[],
		row.status,
		onCopied,
	);
	return (
		<ContextMenu>
			<ContextMenuTrigger>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem
					onPress={() =>
						void unarchive(row.id).catch(() =>
							Alert.alert(t({ message: "Unarchive failed" })),
						)
					}
				>
					<Text>{t({ message: "Unarchive" })}</Text>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onPress={copyId}>
					<Text>{t({ message: "Copy ID" })}</Text>
				</ContextMenuItem>
				<ContextMenuItem onPress={() => shareWorkspace()}>
					<Text>{t({ message: "Share" })}</Text>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
