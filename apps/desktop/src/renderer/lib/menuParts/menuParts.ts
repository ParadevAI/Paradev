import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import type { ComponentType, ReactNode } from "react";

/** The pieces a menu body is made of, so one body renders in a context menu or a dropdown. */
export interface MenuParts {
	Item: ComponentType<{
		className?: string;
		disabled?: boolean;
		variant?: "default" | "destructive";
		onSelect?: (event: Event) => void;
		onClick?: () => void;
		children: ReactNode;
	}>;
	Separator: ComponentType<{ className?: string }>;
	Sub: ComponentType<{ children: ReactNode }>;
	SubTrigger: ComponentType<{ className?: string; children: ReactNode }>;
	SubContent: ComponentType<{
		className?: string;
		sideOffset?: number;
		children: ReactNode;
	}>;
	Shortcut: ComponentType<{ children: ReactNode }>;
	/** Spacing an icon needs before its label; dropdown items already gap. */
	iconClassName: string;
}

export const DROPDOWN_MENU_PARTS: MenuParts = {
	Item: DropdownMenuItem,
	Separator: DropdownMenuSeparator,
	Sub: DropdownMenuSub,
	SubTrigger: DropdownMenuSubTrigger,
	SubContent: DropdownMenuSubContent,
	Shortcut: DropdownMenuShortcut,
	iconClassName: "",
};

export const CONTEXT_MENU_PARTS: MenuParts = {
	Item: ContextMenuItem,
	Separator: ContextMenuSeparator,
	Sub: ContextMenuSub,
	SubTrigger: ContextMenuSubTrigger,
	SubContent: ContextMenuSubContent,
	Shortcut: ContextMenuShortcut,
	iconClassName: "mr-2",
};
