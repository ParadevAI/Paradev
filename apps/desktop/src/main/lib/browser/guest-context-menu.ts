import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { clipboard } from "electron";
import { safeOpenExternal } from "main/lib/safe-url";

type MenuTemplate = (Electron.MenuItemConstructorOptions | Electron.MenuItem)[];

export interface GuestContextMenuOptions {
	wc: Electron.WebContents;
	params: Electron.ContextMenuParams;
	/** Items extensions add with `chrome.contextMenus`. */
	extensionItems: Electron.MenuItem[];
	/** Only a pane can split; a popup window leaves the item out. */
	openInSplit?: (url: string) => void;
}

/**
 * The right-click menu for web content the app hosts, pane or popup window.
 *
 * Electron shows no menu of its own, so a window without this has none at all:
 * no copy or paste in a sign-in field, no back, and none of the items an
 * extension contributes.
 */
export function buildGuestContextMenu({
	wc,
	params,
	extensionItems,
	openInSplit,
}: GuestContextMenuOptions): MenuTemplate {
	const { linkURL, pageURL, selectionText, editFlags } = params;
	const menuItems: MenuTemplate = [];

	if (linkURL) {
		menuItems.push({
			label: i18n._(msg({ message: "Open Link in Default Browser" })),
			click: () => {
				void safeOpenExternal(linkURL);
			},
		});
		if (openInSplit) {
			menuItems.push({
				label: i18n._(msg({ message: "Open Link as New Split" })),
				click: () => openInSplit(linkURL),
			});
		}
		menuItems.push(
			{
				label: i18n._(msg({ message: "Copy Link Address" })),
				click: () => void clipboard.writeText(linkURL),
			},
			{ type: "separator" },
		);
	}

	if (selectionText) {
		menuItems.push({
			label: i18n._(msg({ message: "Copy" })),
			enabled: editFlags.canCopy,
			click: () => wc.copy(),
		});
	}

	if (editFlags.canPaste) {
		menuItems.push({
			label: i18n._(msg({ message: "Paste" })),
			click: () => wc.paste(),
		});
	}

	if (editFlags.canSelectAll) {
		menuItems.push({
			label: i18n._(msg({ message: "Select All" })),
			click: () => wc.selectAll(),
		});
	}

	if (selectionText || editFlags.canPaste || editFlags.canSelectAll) {
		menuItems.push({ type: "separator" });
	}

	if (extensionItems.length > 0) {
		menuItems.push(...extensionItems, { type: "separator" });
	}

	menuItems.push(
		{
			label: i18n._(msg({ message: "Back" })),
			enabled: wc.canGoBack(),
			click: () => wc.goBack(),
		},
		{
			label: i18n._(msg({ message: "Forward" })),
			enabled: wc.canGoForward(),
			click: () => wc.goForward(),
		},
		{
			label: i18n._(msg({ message: "Reload" })),
			click: () => wc.reload(),
		},
	);

	if (!linkURL) {
		const hasPage = !!pageURL && pageURL !== "about:blank";
		menuItems.push(
			{ type: "separator" },
			{
				label: i18n._(msg({ message: "Open Page in Default Browser" })),
				click: () => {
					if (hasPage) void safeOpenExternal(pageURL);
				},
				enabled: hasPage,
			},
			{
				label: i18n._(msg({ message: "Copy Page URL" })),
				click: () => {
					if (pageURL) void clipboard.writeText(pageURL);
				},
				enabled: hasPage,
			},
		);
	}

	return menuItems;
}
