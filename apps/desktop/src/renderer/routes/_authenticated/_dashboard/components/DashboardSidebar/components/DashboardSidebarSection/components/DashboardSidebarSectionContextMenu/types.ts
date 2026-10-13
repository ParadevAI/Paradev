export interface DashboardSidebarSectionActionsProps {
	color: string | null;
	onRename: () => void;
	onSetColor?: (color: string | null) => void;
	onDelete: () => void;
	/** Tag-backed folders only: hide the folder without untagging anyone. */
	onHide?: () => void;
	/** Set when the folder can hold another level of sub-folders. */
	onCreateSubGroup?: () => void;
}

export type SectionActionsMenuKind = "context" | "dropdown";
