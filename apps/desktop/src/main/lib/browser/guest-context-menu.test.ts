import { expect, test } from "bun:test";
import { buildGuestContextMenu } from "./guest-context-menu";

function params(
	overrides: Partial<Electron.ContextMenuParams> = {},
): Electron.ContextMenuParams {
	return {
		linkURL: "",
		pageURL: "https://example.com/sign-in",
		selectionText: "",
		editFlags: { canCopy: true, canPaste: true, canSelectAll: true },
		...overrides,
	} as Electron.ContextMenuParams;
}

const wc = {
	canGoBack: () => true,
	canGoForward: () => false,
	copy: () => {},
	paste: () => {},
	selectAll: () => {},
	goBack: () => {},
	goForward: () => {},
	reload: () => {},
} as unknown as Electron.WebContents;

const labels = (items: ReturnType<typeof buildGuestContextMenu>) =>
	items.map((item) => ("label" in item ? item.label : "---"));

test("a popup window gets the same menu as a pane, minus the split it cannot open", () => {
	const extensionItems = [
		{ label: "Fill with 1Password" },
	] as unknown as Electron.MenuItem[];
	const linkParams = params({ linkURL: "https://example.com/help" });

	const pane = labels(
		buildGuestContextMenu({
			wc,
			params: linkParams,
			extensionItems,
			openInSplit: () => {},
		}),
	);
	const popup = labels(
		buildGuestContextMenu({ wc, params: linkParams, extensionItems }),
	);

	expect(pane).toContain("Open Link as New Split");
	expect(popup).not.toContain("Open Link as New Split");
	for (const label of [
		"Open Link in Default Browser",
		"Copy Link Address",
		"Paste",
		"Fill with 1Password",
		"Back",
		"Reload",
	]) {
		expect(popup).toContain(label);
	}
});

test("page items replace the link items, and a blank page cannot be opened or copied", () => {
	const items = buildGuestContextMenu({
		wc,
		params: params({ pageURL: "about:blank" }),
		extensionItems: [],
	});
	const pageItems = items.filter(
		(item) =>
			"label" in item &&
			(item.label === "Open Page in Default Browser" ||
				item.label === "Copy Page URL"),
	);

	expect(pageItems).toHaveLength(2);
	expect(pageItems.every((item) => "enabled" in item && !item.enabled)).toBe(
		true,
	);
});
