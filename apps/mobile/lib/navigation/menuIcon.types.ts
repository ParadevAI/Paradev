import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

export type MenuIconName =
	| "archive"
	| "collection"
	| "copy"
	| "delete"
	| "info"
	| "markUnread"
	| "openExternal"
	| "openLink"
	| "pin"
	| "private"
	| "rename"
	| "share"
	| "team"
	| "unpin";

export type MenuIconSource = NonNullable<
	ComponentProps<typeof Stack.Toolbar.MenuAction>["icon"]
>;

/** The leading icon of a `Stack.Toolbar` menu row, if this platform draws one. */
export type MenuIcon = (name: MenuIconName) => MenuIconSource | undefined;
