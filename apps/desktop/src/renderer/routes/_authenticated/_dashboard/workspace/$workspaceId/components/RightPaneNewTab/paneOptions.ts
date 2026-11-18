import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { CreatePaneInput } from "@superset/panes";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuFileDiff, LuFileText, LuFolderTree } from "react-icons/lu";
import { TbDeviceDesktop, TbDeviceMobile, TbWorld } from "react-icons/tb";
import type { HotkeyId } from "renderer/hotkeys";
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
	hotkeyId?: HotkeyId;
	gate?: keyof RightPaneGates;
}

const RIGHT_PANE_OPTIONS: RightPaneOption[] = [
	{
		kind: "terminal",
		label: msg({ message: "Terminal" }),
		Icon: BsTerminalPlus,
		hotkeyId: "NEW_GROUP",
	},
	{
		kind: "browser",
		label: msg({ message: "Browser" }),
		Icon: TbWorld,
		hotkeyId: "NEW_BROWSER",
	},
	{
		kind: "diff",
		label: msg({ message: "Changes" }),
		Icon: LuFileDiff,
		hotkeyId: "OPEN_DIFF_VIEWER",
	},
	{ kind: "files", label: msg({ message: "Files" }), Icon: LuFolderTree },
	{ kind: "pages-list", label: msg({ message: "Pages" }), Icon: LuFileText },
	{
		kind: "desktop",
		label: msg({ message: "Desktop" }),
		Icon: TbDeviceDesktop,
		gate: "sandbox",
	},
	{
		kind: "mobile",
		label: msg({ message: "Mobile" }),
		Icon: TbDeviceMobile,
		gate: "mobilePane",
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
