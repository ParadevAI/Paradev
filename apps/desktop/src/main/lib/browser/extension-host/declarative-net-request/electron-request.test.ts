import { expect, test } from "bun:test";
import { toDnrRequest } from "./electron-request";

const page = {
	url: "https://news.example/article",
	parent: { url: "https://top.example/", parent: null },
};

function details(overrides: Partial<Parameters<typeof toDnrRequest>[0]> = {}) {
	return {
		url: "https://cdn.example/a.js",
		method: "GET",
		resourceType: "script",
		initiatorOrigin: "https://news.example",
		webContentsId: 7,
		frame: page,
		...overrides,
	} as Parameters<typeof toDnrRequest>[0];
}

test("a subresource runs in its frame and every ancestor", () => {
	expect(toDnrRequest(details())).toEqual({
		url: "https://cdn.example/a.js",
		method: "GET",
		resourceType: "script",
		initiator: "https://news.example",
		tabId: 7,
		frameUrls: ["https://news.example/article", "https://top.example/"],
	});
});

test("a sub_frame navigation's chain starts at the frame's parent", () => {
	expect(
		toDnrRequest(details({ resourceType: "subFrame" }))?.frameUrls,
	).toEqual(["https://top.example/"]);
	expect(
		toDnrRequest(details({ resourceType: "mainFrame" }))?.frameUrls,
	).toEqual([]);
});

test("extension requests and protected hosts are out of reach", () => {
	expect(
		toDnrRequest(details({ initiatorOrigin: "chrome-extension://abc" })),
	).toBeNull();
	expect(
		toDnrRequest(details({ url: "https://chromewebstore.google.com/x" })),
	).toBeNull();
});

test("an opaque initiator is dropped and a missing webContents is tab -1", () => {
	const request = toDnrRequest(
		details({
			initiatorOrigin: "null",
			webContentsId: undefined,
			resourceType: "somethingNew" as never,
		}),
	);
	expect(request?.initiator).toBeUndefined();
	expect(request?.tabId).toBe(-1);
	expect(request?.resourceType).toBe("other");
});
