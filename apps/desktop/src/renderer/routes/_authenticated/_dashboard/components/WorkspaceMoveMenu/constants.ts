import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";

/** The right-click menu and the ⋯ menu build the same items from their own primitives. */
export const MOVE_MENU_PRIMITIVES = {
	context: {
		Sub: ContextMenuSub,
		SubTrigger: ContextMenuSubTrigger,
		SubContent: ContextMenuSubContent,
		Item: ContextMenuItem,
		Separator: ContextMenuSeparator,
		iconClassName: "size-4 mr-2",
	},
	dropdown: {
		Sub: DropdownMenuSub,
		SubTrigger: DropdownMenuSubTrigger,
		SubContent: DropdownMenuSubContent,
		Item: DropdownMenuItem,
		Separator: DropdownMenuSeparator,
		iconClassName: "size-4",
	},
} as const;

export type MoveMenuKind = keyof typeof MOVE_MENU_PRIMITIVES;
