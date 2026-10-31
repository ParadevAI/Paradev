import type { ComponentType } from "react";

export interface FileActionsMenuProps {
	onCopyPath: () => void;
	onViewFile: () => void;
	onAddComment: () => void;
	onDelete: () => void;
}

export type FileActionsMenuComponent = ComponentType<FileActionsMenuProps>;
