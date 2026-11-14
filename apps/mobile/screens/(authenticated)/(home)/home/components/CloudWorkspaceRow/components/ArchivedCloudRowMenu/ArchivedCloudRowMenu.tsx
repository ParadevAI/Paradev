import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import { useRef } from "react";
import type { ViewInstance } from "react-native";
import { Alert, View } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import { itemFromCloudRow } from "@/hooks/useCloudWorkspaceItems";
import { anchorOf } from "@/screens/(authenticated)/components/ToolbarAnchor";
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
	const rowRef = useRef<ViewInstance>(null);
	const { copyId, shareWorkspace } = useWorkspaceRowActions(
		itemFromCloudRow(row),
		cache,
		[],
		row.status,
		onCopied,
	);
	return (
		<Link
			href="/(authenticated)/(home)"
			onPress={(event) => event.preventDefault()}
			asChild
		>
			<Link.Trigger>
				<View ref={rowRef} collapsable={false}>
					{children}
				</View>
			</Link.Trigger>
			<Link.Menu>
				<Link.MenuAction
					icon="arrow.uturn.backward"
					onPress={() =>
						void unarchive(row.id).catch(() =>
							Alert.alert(t({ message: "Unarchive failed" })),
						)
					}
				>
					{t({ message: "Unarchive" })}
				</Link.MenuAction>
				<Link.Menu inline>
					<Link.MenuAction icon="doc.on.doc" onPress={copyId}>
						{t({ message: "Copy ID" })}
					</Link.MenuAction>
					<Link.MenuAction
						icon="square.and.arrow.up"
						onPress={() => shareWorkspace(anchorOf(rowRef))}
					>
						{t({ message: "Share" })}
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
