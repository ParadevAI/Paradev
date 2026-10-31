import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import { useRef } from "react";
import type { ViewInstance } from "react-native";
import { View } from "react-native";
import { anchorOf } from "@/screens/(authenticated)/components/ToolbarAnchor";
import type { WorkspaceRowMenuProps } from "./WorkspaceRowMenu.types";

export function WorkspaceRowMenu({
	pinned,
	onTogglePin,
	canRename,
	canDelete,
	isCloud,
	isUnread,
	onToggleUnread,
	onRename,
	onDelete,
	onCopyId,
	onShare,
	children,
}: WorkspaceRowMenuProps) {
	const { t } = useLingui();
	const rowRef = useRef<ViewInstance>(null);
	// Tap navigation lives on the row itself; the Link exists solely because
	// Link.Menu must be a direct child of Link, so tap is a no-op here.
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
				{/* Each action is its own direct child: Link.Menu drops anything
				    wrapped in a Fragment. */}
				<Link.MenuAction
					icon={isUnread ? "bell" : "bell.badge"}
					onPress={onToggleUnread}
				>
					{isUnread
						? t({
								message: "Mark as Read",
							})
						: t({
								message: "Mark as Unread",
							})}
				</Link.MenuAction>
				{onTogglePin ? (
					<Link.MenuAction
						icon={pinned ? "pin.slash" : "pin"}
						onPress={onTogglePin}
					>
						{pinned ? t({ message: "Unpin" }) : t({ message: "Pin" })}
					</Link.MenuAction>
				) : null}
				{canRename ? (
					<Link.MenuAction icon="pencil" onPress={onRename}>
						{t({ message: "Rename" })}
					</Link.MenuAction>
				) : null}
				{canDelete && isCloud ? (
					<Link.MenuAction icon="archivebox" onPress={onDelete}>
						{t({ message: "Archive" })}
					</Link.MenuAction>
				) : null}
				{canDelete && !isCloud ? (
					<Link.MenuAction icon="trash" destructive onPress={onDelete}>
						{t({ message: "Delete" })}
					</Link.MenuAction>
				) : null}
				<Link.Menu inline>
					<Link.MenuAction icon="doc.on.doc" onPress={onCopyId}>
						{t({ message: "Copy ID" })}
					</Link.MenuAction>
					<Link.MenuAction
						icon="square.and.arrow.up"
						onPress={() => onShare(anchorOf(rowRef))}
					>
						{t({ message: "Share" })}
					</Link.MenuAction>
				</Link.Menu>
			</Link.Menu>
		</Link>
	);
}
