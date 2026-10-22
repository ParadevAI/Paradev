import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import {
	LuFileDiff,
	LuFiles,
	LuFileText,
	LuFolderTree,
	LuGitPullRequestArrow,
} from "react-icons/lu";
import { TbDeviceDesktop, TbDeviceMobile, TbWorld } from "react-icons/tb";
import type { RightPaneKind } from "./types";

export interface RightPaneOption {
	kind: RightPaneKind;
	label: MessageDescriptor;
	Icon: IconType;
	group: "workspace" | "tool";
	sandboxOnly?: boolean;
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
		kind: "changes-list",
		label: msg({ message: "Files changed" }),
		Icon: LuFiles,
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
		sandboxOnly: true,
	},
	{
		kind: "mobile",
		label: msg({ message: "Mobile" }),
		Icon: TbDeviceMobile,
		group: "tool",
	},
	{
		kind: "terminal",
		label: msg({ message: "Terminal" }),
		Icon: BsTerminalPlus,
		group: "tool",
	},
];

export function getRightPaneOptions(canAddDesktop: boolean): RightPaneOption[] {
	return RIGHT_PANE_OPTIONS.filter(
		(option) => !option.sandboxOnly || canAddDesktop,
	);
}
