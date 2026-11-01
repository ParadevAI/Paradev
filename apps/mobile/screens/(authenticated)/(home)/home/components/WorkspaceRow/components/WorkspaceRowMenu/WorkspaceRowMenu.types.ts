import type { ReactNode } from "react";

export interface WorkspaceRowMenuProps {
	pinned: boolean;
	onTogglePin?: () => void;
	canRename: boolean;
	canDelete: boolean;
	/** A cloud workspace is archived, not deleted. */
	isCloud: boolean;
	isUnread: boolean;
	onToggleUnread: () => void;
	onRename: () => void;
	onDelete: () => void;
	onCopyId: () => void;
	/** Gets the row's tag, so iPad's share popover points at the row. */
	onShare: (anchor?: number) => void;
	/** The row's app path, for menus that can open or copy it as a link. */
	link?: { href: string; onCopied: () => void };
	children: ReactNode;
}
