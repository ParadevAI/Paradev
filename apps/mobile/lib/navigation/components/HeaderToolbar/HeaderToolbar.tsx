import { Stack } from "expo-router";
import { Children, isValidElement, type ReactNode } from "react";
import { menuIcon } from "../../menuIcon";
import { toolbarIcon } from "../../toolbarIcon";
import type {
	HeaderButtonProps,
	HeaderMenuActionProps,
	HeaderMenuProps,
	HeaderMenuSectionProps,
	HeaderSubmenuProps,
	HeaderToolbarComponent,
	HeaderToolbarProps,
	HeaderViewProps,
} from "./HeaderToolbar.types";

// Stack.Toolbar finds its items by element type, so these only mark what to
// build; `toolbarItems` turns them into the Stack.Toolbar elements.
const Button = (_: HeaderButtonProps) => null;
const Menu = (_: HeaderMenuProps) => null;
const Submenu = (_: HeaderSubmenuProps) => null;
const MenuSection = (_: HeaderMenuSectionProps) => null;
const MenuAction = (_: HeaderMenuActionProps) => null;
const Spacer = () => null;
const View = (_: HeaderViewProps) => null;

function toolbarItems(children: ReactNode): ReactNode {
	return Children.map(children, (child) => {
		if (!isValidElement(child)) return child;
		switch (child.type) {
			case Button: {
				const { icon, ...props } = child.props as HeaderButtonProps;
				return (
					<Stack.Toolbar.Button
						{...props}
						{...(icon ? { icon: toolbarIcon(icon) } : {})}
					/>
				);
			}
			case Menu: {
				const { icon, children, ...props } = child.props as HeaderMenuProps;
				return (
					<Stack.Toolbar.Menu
						{...props}
						{...(icon ? { icon: toolbarIcon(icon) } : {})}
					>
						{toolbarItems(children)}
					</Stack.Toolbar.Menu>
				);
			}
			case Submenu: {
				const { icon, title, children } = child.props as HeaderSubmenuProps;
				return (
					<Stack.Toolbar.Menu
						{...(icon ? { icon: menuIcon(icon) } : {})}
						title={title}
						accessibilityLabel={title}
					>
						{toolbarItems(children)}
					</Stack.Toolbar.Menu>
				);
			}
			case MenuSection: {
				const { children } = child.props as HeaderMenuSectionProps;
				return (
					<Stack.Toolbar.Menu inline>
						{toolbarItems(children)}
					</Stack.Toolbar.Menu>
				);
			}
			case MenuAction: {
				const { icon, ...props } = child.props as HeaderMenuActionProps;
				return (
					<Stack.Toolbar.MenuAction
						{...props}
						{...(icon ? { icon: menuIcon(icon) } : {})}
					/>
				);
			}
			case Spacer:
				return <Stack.Toolbar.Spacer />;
			case View:
				return <Stack.Toolbar.View {...(child.props as HeaderViewProps)} />;
			default:
				return child;
		}
	});
}

function HeaderToolbarRoot({ placement, children }: HeaderToolbarProps) {
	return (
		<Stack.Toolbar placement={placement}>
			{toolbarItems(children)}
		</Stack.Toolbar>
	);
}

export const HeaderToolbar: HeaderToolbarComponent = Object.assign(
	HeaderToolbarRoot,
	{ Button, Menu, Submenu, MenuSection, MenuAction, Spacer, View },
);
