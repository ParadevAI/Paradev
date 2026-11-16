import { msg } from "@lingui/core/macro";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { BookOpenIcon, HistoryIcon, Layers, SettingsIcon } from "lucide-react";
import { type SwitcherOpenedVia, useFrameStackStore } from "../../core/frames";
import type { Command, CommandProvider } from "../../core/types";
import { RecentlyViewedFrame } from "../../ui/RecentlyViewed/RecentlyViewedFrame";
import { settingsTabCommands } from "../settings/commands";

export const WORKSPACES_COMMAND_ID = "nav.workspaces";

export function openWorkspaceList(
	options: { via?: SwitcherOpenedVia; holdsModifier?: boolean } = {},
): void {
	useFrameStackStore.getState().openSwitcher({
		via: options.via ?? "command",
		holdsModifier: options.holdsModifier ?? false,
	});
}

export const navigationProvider: CommandProvider = {
	id: "navigation",
	provide: () => {
		const commands: Command[] = [
			{
				id: "nav.settings",
				title: msg({ message: "Settings" }),
				section: "navigation",
				icon: SettingsIcon,
				hotkeyId: "OPEN_SETTINGS",
				children: settingsTabCommands,
				run: (ctx) => ctx.navigate("/settings/account"),
			},
			{
				id: "nav.recentlyViewed",
				title: msg({
					message: "Recently Viewed",
				}),
				section: "navigation",
				icon: HistoryIcon,
				keywords: ["history", "recent", "back"],
				renderFrame: () => <RecentlyViewedFrame />,
			},
			{
				id: WORKSPACES_COMMAND_ID,
				title: msg({
					message: "Workspaces",
				}),
				section: "navigation",
				icon: Layers,
				hotkeyId: "OPEN_WORKSPACE_LIST",
				keywords: ["workspace", "project", "repo", "repository", "switch"],
				run: () => openWorkspaceList({ via: "command" }),
			},
			{
				id: "nav.docs",
				title: msg({
					message: "Open documentation",
				}),
				section: "navigation",
				icon: BookOpenIcon,
				keywords: ["docs", "help"],
				run: () => {
					window.open(CANONICAL_URLS.DOCS, "_blank", "noreferrer");
				},
			},
		];

		return commands;
	},
};
