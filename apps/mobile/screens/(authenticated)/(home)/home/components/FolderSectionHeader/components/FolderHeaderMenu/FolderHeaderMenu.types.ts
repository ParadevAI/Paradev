import type { ComponentType } from "react";

export interface FolderHeaderMenuProps {
	/** The group's color, or null for the default. */
	color: string | null;
	onRename: () => void;
	onSetColor: (color: string | null) => void;
	onDelete: () => void;
}

export type FolderHeaderMenuComponent = ComponentType<FolderHeaderMenuProps>;
