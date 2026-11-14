import type { ComponentType, ReactElement, ReactNode } from "react";
import type { MenuIconName } from "../../menuIcon.types";
import type { ToolbarIconName } from "../../toolbarIcon.types";

export interface HeaderToolbarProps {
	placement: "left" | "right" | "bottom";
	children?: ReactNode;
}

export interface HeaderButtonProps {
	icon?: ToolbarIconName;
	accessibilityLabel?: string;
	onPress?: () => void;
	hidden?: boolean;
	disabled?: boolean;
	variant?: "plain" | "prominent";
	tintColor?: string;
	separateBackground?: boolean;
}

export interface HeaderMenuProps {
	icon?: ToolbarIconName;
	accessibilityLabel?: string;
	separateBackground?: boolean;
	children?: ReactNode;
}

/** A titled menu inside a menu. */
export interface HeaderSubmenuProps {
	title: string;
	icon?: MenuIconName;
	children?: ReactNode;
}

/** Rows shown in place, set apart from the rows around them. */
export interface HeaderMenuSectionProps {
	children?: ReactNode;
}

export interface HeaderMenuActionProps {
	icon?: MenuIconName;
	isOn?: boolean;
	destructive?: boolean;
	onPress: () => void;
	children: string;
}

export interface HeaderViewProps {
	hidesSharedBackground?: boolean;
	children?: ReactElement;
}

/** Header and bottom-bar items of the current screen. */
export type HeaderToolbarComponent = ComponentType<HeaderToolbarProps> & {
	Button: ComponentType<HeaderButtonProps>;
	Menu: ComponentType<HeaderMenuProps>;
	Submenu: ComponentType<HeaderSubmenuProps>;
	MenuSection: ComponentType<HeaderMenuSectionProps>;
	MenuAction: ComponentType<HeaderMenuActionProps>;
	Spacer: ComponentType;
	View: ComponentType<HeaderViewProps>;
};
