import { expect, test } from "bun:test";
import {
	collectExtensionContexts,
	type ExtensionView,
} from "./extension-contexts";

const views: ExtensionView[] = [
	{
		contextType: "POPUP",
		contextId: "7",
		url: "chrome-extension://abc/popup/index.html",
		tabId: -1,
		windowId: -1,
	},
	{
		contextType: "TAB",
		contextId: "8",
		url: "chrome-extension://abc/app/app.html#/page/welcome",
		tabId: 8,
		windowId: 3,
	},
	{
		contextType: "OFFSCREEN_DOCUMENT",
		contextId: "9",
		url: "chrome-extension://abc/offscreen.html",
		tabId: -1,
		windowId: -1,
	},
];

test("the service worker counts as a context, with no document of its own", () => {
	const [background] = collectExtensionContexts([]);

	expect(background).toEqual({
		contextId: "background",
		contextType: "BACKGROUND",
		frameId: -1,
		incognito: false,
		tabId: -1,
		windowId: -1,
	});
});

test("an extension finds its open popup, which is the question it asks", () => {
	const popups = collectExtensionContexts(views, { contextTypes: ["POPUP"] });

	expect(popups.map((context) => context.contextId)).toEqual(["7"]);
	expect(popups[0]?.documentUrl).toBe(
		"chrome-extension://abc/popup/index.html",
	);
	expect(popups[0]?.documentOrigin).toBe("chrome-extension://abc");
	expect(collectExtensionContexts([], { contextTypes: ["POPUP"] })).toEqual([]);
});

test("filters narrow by tab, window and url, and all of them must match", () => {
	const ids = (filter: Parameters<typeof collectExtensionContexts>[1]) =>
		collectExtensionContexts(views, filter).map((c) => c.contextId);

	expect(ids({ tabIds: [8] })).toEqual(["8"]);
	expect(ids({ windowIds: [3] })).toEqual(["8"]);
	expect(
		ids({ documentUrls: ["chrome-extension://abc/offscreen.html"] }),
	).toEqual(["9"]);
	expect(ids({ contextTypes: ["TAB"], tabIds: [7] })).toEqual([]);
	// No document ids are minted here, so filtering on one can only be empty.
	expect(ids({ documentIds: ["any"] })).toEqual([]);
});
