import type { MoveDestinationComputer } from "@superset/shared/move-book";
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
	/** Where the workspace can move; absent where it cannot move from here. */
	move?: {
		computers: MoveDestinationComputer[];
		canMoveToCloud: boolean;
		moveToCloud: () => void;
		moveToComputer: (computer: MoveDestinationComputer) => void;
	};
	/** Desktop's sidebar groups in the workspace's project. */
	groups?: {
		options: { tag: string; name: string }[];
		/** The group the workspace is in, or null. */
		current: string | null;
		onMove: (tag: string | null) => void;
		onCreate: () => void;
	};
	children: ReactNode;
}
