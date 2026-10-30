import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

export type ToolbarIconName =
	| "add"
	| "comments"
	| "commentMode"
	| "commentModeOn"
	| "confirm"
	| "expand"
	| "filter"
	| "filterActive"
	| "jumpToFile"
	| "more"
	| "search"
	| "sessions"
	| "share"
	| "stop"
	| "voice"
	| "voiceSettings";

export type ToolbarIconSource = NonNullable<
	ComponentProps<typeof Stack.Toolbar.Button>["icon"]
>;

/** The `icon` a `Stack.Toolbar` button or menu shows for an action. */
export type ToolbarIcon = (name: ToolbarIconName) => ToolbarIconSource;
