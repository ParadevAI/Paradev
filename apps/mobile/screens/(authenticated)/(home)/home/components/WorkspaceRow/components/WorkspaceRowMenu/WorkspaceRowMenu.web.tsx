import { useLingui } from "@lingui/react/macro";
import * as Clipboard from "expo-clipboard";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Text } from "@/components/ui/text";
import { appUrl } from "@/lib/app-url";
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
	link,
	children,
}: WorkspaceRowMenuProps) {
	const { t } = useLingui();
	const url = link
		? new URL(appUrl(link.href), window.location.href).href
		: null;
	return (
		<ContextMenu>
			<ContextMenuTrigger>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem onPress={onToggleUnread}>
					<Text>
						{isUnread
							? t({ message: "Mark as Read" })
							: t({ message: "Mark as Unread" })}
					</Text>
				</ContextMenuItem>
				{onTogglePin ? (
					<ContextMenuItem onPress={onTogglePin}>
						<Text>
							{pinned ? t({ message: "Unpin" }) : t({ message: "Pin" })}
						</Text>
					</ContextMenuItem>
				) : null}
				{canRename ? (
					<ContextMenuItem onPress={onRename}>
						<Text>{t({ message: "Rename" })}</Text>
					</ContextMenuItem>
				) : null}
				{canDelete && isCloud ? (
					<ContextMenuItem onPress={onDelete}>
						<Text>{t({ message: "Archive" })}</Text>
					</ContextMenuItem>
				) : null}
				{canDelete && !isCloud ? (
					<ContextMenuItem variant="destructive" onPress={onDelete}>
						<Text>{t({ message: "Delete" })}</Text>
					</ContextMenuItem>
				) : null}
				<ContextMenuSeparator />
				{url && link ? (
					<>
						<ContextMenuItem
							onPress={() => window.open(url, "_blank", "noopener")}
						>
							<Text>{t({ message: "Open in new tab" })}</Text>
						</ContextMenuItem>
						<ContextMenuItem
							onPress={() =>
								void Clipboard.setStringAsync(url).then(link.onCopied)
							}
						>
							<Text>{t({ message: "Copy link" })}</Text>
						</ContextMenuItem>
					</>
				) : null}
				<ContextMenuItem onPress={onCopyId}>
					<Text>{t({ message: "Copy ID" })}</Text>
				</ContextMenuItem>
				<ContextMenuItem onPress={() => onShare()}>
					<Text>{t({ message: "Share" })}</Text>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
