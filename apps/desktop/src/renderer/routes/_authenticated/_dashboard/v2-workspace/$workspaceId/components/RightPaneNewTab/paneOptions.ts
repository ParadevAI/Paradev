import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { CreatePaneInput } from "@superset/panes";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import {
	LuFileDiff,
	LuFileText,
	LuFolderTree,
	LuGitPullRequestArrow,
} from "react-icons/lu";
import { TbDeviceDesktop, TbDeviceMobile, TbWorld } from "react-icons/tb";
import type {
	BrowserPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { NEW_DIFF_PANE } from "../../utils/openChangesPaneInStore";
import type { RightPaneKind } from "./types";

export interface RightPaneGates {
	sandbox: boolean;
	mobilePane: boolean;
}

export interface RightPaneOption {
	kind: RightPaneKind;
	label: MessageDescriptor;
	Icon: IconType;
	group: "workspace" | "tool";
	gate?: keyof RightPaneGates;
}

const RIGHT_PANE_OPTIONS: RightPaneOption[] = [
	{
		kind: "files",
		label: msg({ message: "Files" }),
		Icon: LuFolderTree,
		group: "workspace",
	},
	{
		kind: "diff",
		label: msg({ message: "Changes" }),
		Icon: LuFileDiff,
		group: "workspace",
	},
	{
		kind: "review",
		label: msg({ message: "Review" }),
		Icon: LuGitPullRequestArrow,
		group: "workspace",
	},
	{
		kind: "pages-list",
		label: msg({ message: "Pages" }),
		Icon: LuFileText,
		group: "workspace",
	},
	{
		kind: "browser",
		label: msg({ message: "Browser" }),
		Icon: TbWorld,
		group: "tool",
	},
	{
		kind: "desktop",
		label: msg({ message: "Desktop" }),
		Icon: TbDeviceDesktop,
		group: "tool",
		gate: "sandbox",
	},
	{
		kind: "mobile",
		label: msg({ message: "Mobile" }),
		Icon: TbDeviceMobile,
		group: "tool",
		gate: "mobilePane",
	},
	{
		kind: "terminal",
		label: msg({ message: "Terminal" }),
		Icon: BsTerminalPlus,
		group: "tool",
	},
];

export function getRightPaneOptions(gates: RightPaneGates): RightPaneOption[] {
	return RIGHT_PANE_OPTIONS.filter(
		(option) => !option.gate || gates[option.gate],
	);
}

export function createRightPane(
	kind: RightPaneKind,
	{
		mintTerminalId,
		browserUrl,
	}: { mintTerminalId: () => string; browserUrl: string },
): CreatePaneInput<PaneViewerData> {
	switch (kind) {
		case "files":
		case "review":
		case "pages-list":
		case "desktop":
		case "mobile":
			return { kind, data: { kind } };
		case "diff":
			return { kind, data: { ...NEW_DIFF_PANE.data } };
		case "browser":
			return { kind, data: { url: browserUrl } as BrowserPaneData };
		case "terminal":
			return {
				kind,
				data: {
					terminalId: mintTerminalId(),
					createOnAttach: true,
				} as TerminalPaneData,
			};
	}
}
