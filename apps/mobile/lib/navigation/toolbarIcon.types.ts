import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

export type ToolbarIconName =
	| "add"
	| "close"
	| "comments"
	| "commentMode"
	| "commentModeOn"
	| "confirm"
	| "expand"
	| "filter"
	| "filterActive"
	| "fix"
	| "jumpToFile"
	| "link"
	| "mic"
	| "micOff"
	| "more"
	| "overflow"
	| "search"
	| "send"
	| "sessions"
	| "share"
	| "stop"
	| "submit"
	| "voice"
	| "voiceSettings";

export type ToolbarIconSource = NonNullable<
	ComponentProps<typeof Stack.Toolbar.Button>["icon"]
>;

/** The `icon` a `Stack.Toolbar` button or menu shows, if this platform has one. */
export type ToolbarIcon = (
	name: ToolbarIconName,
) => ToolbarIconSource | undefined;
