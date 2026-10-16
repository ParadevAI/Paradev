import { useLingui } from "@lingui/react/macro";
import type { IconType } from "react-icons";
import { LuCopy, LuExternalLink, LuLink } from "react-icons/lu";
import { formatHotkeyDisplay } from "renderer/hotkeys/display";
import { PLATFORM } from "renderer/hotkeys/registry";

export interface MessageMenuItem {
	id: "copy-link" | "copy-message" | "open";
	label: string;
	icon: IconType;
	/** The key Slack's menu answers while open, and how it shows it. */
	key?: { matches: (event: KeyboardEvent) => boolean; display: string };
	run: () => void;
}

/** The items of Slack's message menu that work from here, for both More actions and right-click. */
export function useMessageMenuItems({
	text,
	permalink,
}: {
	text: string;
	permalink: string | null;
}): MessageMenuItem[] {
	const { t } = useLingui();
	const items: MessageMenuItem[] = [];
	if (permalink)
		items.push({
			id: "copy-link",
			label: t({ message: "Copy link" }),
			icon: LuLink,
			key: {
				matches: (e) => e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey,
				display: "L",
			},
			run: () => void navigator.clipboard.writeText(permalink),
		});
	if (text)
		items.push({
			id: "copy-message",
			label: t({ message: "Copy message" }),
			icon: LuCopy,
			key: {
				matches: (e) => e.key.toLowerCase() === "c" && (e.metaKey || e.ctrlKey),
				display: formatHotkeyDisplay(
					PLATFORM === "mac" ? "meta+c" : "ctrl+c",
					PLATFORM,
				).text,
			},
			run: () => void navigator.clipboard.writeText(text),
		});
	if (permalink)
		items.push({
			id: "open",
			label: t({ message: "Open in Slack" }),
			icon: LuExternalLink,
			run: () => window.open(permalink, "_blank"),
		});
	return items;
}
