import { afterAll, beforeAll, expect, type mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaneLayoutSnapshot } from "@superset/shared/pane-layout-ops";
import { dialog, session, webContents } from "electron";
import { BROWSER_PARTITION } from "shared/constants";
import {
	type PaneLayoutRendererRequest,
	paneLayoutRequests,
} from "../pane-layout/pane-layout-requests";
import {
	startBrowserBridge,
	stopBrowserBridge,
	type UserExtensions,
} from "./browser-bridge";
import { getBrowserBridgeInfo } from "./browser-bridge-info";
import { browserManager } from "./browser-manager";
import { browserLocations } from "./chromium-profiles";

const sessions = new Map<string, object>();
const panes = new Map<number, object>();
const fromIdMock = webContents.fromId as unknown as ReturnType<typeof mock>;
const fromPartitionMock = session.fromPartition as unknown as ReturnType<
	typeof mock
>;
const preloadFromId = fromIdMock.getMockImplementation();
const preloadFromPartition = fromPartitionMock.getMockImplementation();

function fakePane(id: number, partition: string) {
	panes.set(id, {
		session: session.fromPartition(partition),
		isDestroyed: () => false,
		getURL: () => `https://example.com/${partition}`,
		getTitle: () => partition,
		isLoading: () => false,
		// Other scripts (the focus-forward mousedown wait) never settle, as in a page nobody clicks.
		executeJavaScript: (code: string) =>
			code === "document.title"
				? Promise.resolve("page data")
				: new Promise(() => {}),
		setBackgroundThrottling: () => {},
		setWindowOpenHandler: () => {},
		on: () => {},
		off: () => {},
	});
}

const INSTALLED_ID = "bcjindcccaagfpapjjmafapmmgkkhgoa";
const extensionCalls: string[] = [];
let userSays: boolean | "never answers" = false;
// Resolves as soon as the question closes: on the user's answer or the bridge's abort.
const answer = (signal: AbortSignal) =>
	userSays === "never answers"
		? new Promise<boolean>((resolve) =>
				signal.addEventListener("abort", () => resolve(false)),
			)
		: Promise.resolve(userSays);
const extensions: UserExtensions = {
	list: () => [
		{ id: INSTALLED_ID, name: "JSON Formatter", version: "1", pinned: false },
	],
	install: async (id, signal) => {
		extensionCalls.push(`install ${id}`);
		return (await answer(signal))
			? {
					status: "installed",
					extension: { id, name: "New", version: "1" },
				}
			: { status: "declined" };
	},
	remove: async (id, signal) => {
		extensionCalls.push(`remove ${id}`);
		return answer(signal);
	},
	setPinned: (id, pinned) => {
		extensionCalls.push(`pin ${id} ${pinned}`);
	},
};

const home = mkdtempSync(join(tmpdir(), "bridge-home-"));
const [chrome] = browserLocations(process.platform);
if (!chrome) throw new Error("no Chromium location on this platform");
const chromeProfile = join(home, chrome.relativePath, "Default");

beforeAll(async () => {
	mkdirSync(chromeProfile, { recursive: true });
	writeFileSync(join(chromeProfile, "History"), "");
	fromPartitionMock.mockImplementation((partition: string) => {
		if (!sessions.has(partition)) sessions.set(partition, { partition });
		return sessions.get(partition);
	});
	fromIdMock.mockImplementation((id: number) => panes.get(id) ?? null);
	fakePane(901, BROWSER_PARTITION);
	fakePane(902, BROWSER_PARTITION);
	browserManager.register("pane-b", 901, "ws-bridge");
	browserManager.register("pane-a", 902, "ws-bridge");
	await startBrowserBridge({ homeDir: home, extensions, answerDeadlineMs: 50 });
});

afterAll(async () => {
	await stopBrowserBridge();
	rmSync(home, { recursive: true, force: true });
	browserManager.unregister("pane-b");
	browserManager.unregister("pane-a");
	fromIdMock.mockImplementation(preloadFromId ?? (() => null));
	fromPartitionMock.mockImplementation(preloadFromPartition ?? (() => ({})));
});

test("agents reach every browser pane", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const call = (path: string, init?: RequestInit) =>
		fetch(`${bridge.endpoint}${path}`, {
			...init,
			headers: {
				authorization: `Bearer ${bridge.secret}`,
				"content-type": "application/json",
			},
		});

	const listed = await (await call("/panes?workspaceId=ws-bridge")).json();
	expect(
		listed.panes.map((pane: { paneId: string }) => pane.paneId).sort(),
	).toEqual(["pane-a", "pane-b"]);

	const userEval = await call("/panes/pane-b/eval", {
		method: "POST",
		body: JSON.stringify({ workspaceId: "ws-bridge", code: "document.title" }),
	});
	expect(await userEval.json()).toEqual({ result: "page data" });

	const cdpClose = await new Promise<number>((resolve) => {
		const url = new URL("/panes/pane-b/cdp", bridge.endpoint);
		url.protocol = "ws:";
		url.searchParams.set("workspaceId", "ws-bridge");
		url.searchParams.set("token", bridge.secret);
		const socket = new WebSocket(url);
		socket.onclose = (event) => resolve(event.code);
	});
	expect(cdpClose).not.toBe(1008);

	expect((await call("/panes")).status).toBe(400);
});

test("an agent copies the user's Chrome logins only after the user allows it", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const showMessageBox = dialog.showMessageBox as unknown as ReturnType<
		typeof mock
	>;
	const importLogins = () =>
		fetch(`${bridge.endpoint}/panes/pane-a/import-cookies`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${bridge.secret}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				workspaceId: "ws-bridge",
				sourceId: chromeProfile,
			}),
		});
	showMessageBox.mockImplementationOnce(() => Promise.resolve({ response: 1 }));
	const refused = await importLogins();
	expect(refused.status).toBe(403);
	expect(String(showMessageBox.mock.calls.at(-1)?.at(-1)?.message)).toContain(
		chrome.name,
	);

	showMessageBox.mockImplementationOnce(() => Promise.resolve({ response: 0 }));
	expect((await importLogins()).status).not.toBe(403);
});

test("an open answers with the pane made for it, even when an unloaded pane is rebuilt first", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	fakePane(903, BROWSER_PARTITION);
	fakePane(904, BROWSER_PARTITION);
	browserManager.once("open-request", (request: { requestId: string }) => {
		// Showing the workspace rebuilds its unloaded tab before the new one exists.
		browserManager.register("rebuilt-pane", 903, "ws-bridge");
		browserManager.resolveOpenRequest(request.requestId, "opened-pane");
		browserManager.register("opened-pane", 904, "ws-bridge");
	});
	try {
		const opened = await fetch(`${bridge.endpoint}/open`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${bridge.secret}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				workspaceId: "ws-bridge",
				url: "https://example.com/",
				show: true,
			}),
		});
		expect((await opened.json()).paneId).toBe("opened-pane");
	} finally {
		browserManager.unregister("rebuilt-pane");
		browserManager.unregister("opened-pane");
	}
});

test("an agent lists and uses panes after hidden-pane eviction unloaded them", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const RENDERER = 990;
	const layoutPane = (id: string) => ({
		id,
		kind: "browser",
		title: id,
		terminalId: null,
		active: false,
		browser: { url: `https://example.com/${id}` },
	});
	const layout: PaneLayoutSnapshot = {
		activeTabId: "tab",
		tabs: [
			{
				id: "tab",
				title: null,
				active: true,
				activePaneId: "pane-a",
				layout: { type: "pane", paneId: "pane-a" },
				panes: [
					layoutPane("pane-a"),
					layoutPane("unloaded-pane-a"),
					layoutPane("unloaded-pane-b"),
				],
			},
		],
	};
	const renderer = (request: PaneLayoutRendererRequest) => {
		if (request.op.type === "wakeBrowser") {
			const woken = { "unloaded-pane-a": 905, "unloaded-pane-b": 906 }[
				request.op.paneId
			];
			if (!woken) {
				paneLayoutRequests.respond(
					{
						requestId: request.requestId,
						error: { code: "NOT_FOUND", message: "no" },
					},
					RENDERER,
				);
				return;
			}
			fakePane(woken, BROWSER_PARTITION);
			browserManager.register(request.op.paneId, woken, "ws-bridge");
		}
		paneLayoutRequests.respond(
			{
				requestId: request.requestId,
				result: { paneId: null, tabId: null, layout },
			},
			RENDERER,
		);
	};
	paneLayoutRequests.addSubscriber(RENDERER);
	paneLayoutRequests.on("request", renderer);
	const call = (path: string, init?: RequestInit) =>
		fetch(`${bridge.endpoint}${path}`, {
			...init,
			headers: {
				authorization: `Bearer ${bridge.secret}`,
				"content-type": "application/json",
			},
		});
	const evaluate = (paneId: string) =>
		call(`/panes/${paneId}/eval`, {
			method: "POST",
			body: JSON.stringify({
				workspaceId: "ws-bridge",
				code: "document.title",
			}),
		});
	try {
		const listed = await (await call("/panes?workspaceId=ws-bridge")).json();
		expect(
			listed.panes.map((pane: { paneId: string; loaded: boolean }) => [
				pane.paneId,
				pane.loaded,
			]),
		).toEqual([
			["pane-a", true],
			["unloaded-pane-a", false],
			["unloaded-pane-b", false],
			["pane-b", true],
		]);
		for (const paneId of ["unloaded-pane-a", "unloaded-pane-b"]) {
			expect(await (await evaluate(paneId)).json()).toEqual({
				result: "page data",
			});
		}
	} finally {
		paneLayoutRequests.off("request", renderer);
		paneLayoutRequests.removeSubscriber(RENDERER);
		browserManager.unregister("unloaded-pane-a");
		browserManager.unregister("unloaded-pane-b");
	}
});

test("before a desktop window is ready, an agent is told to retry, not that its pane is gone", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const response = await fetch(`${bridge.endpoint}/panes/unloaded-pane/eval`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${bridge.secret}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ workspaceId: "ws-bridge", code: "1" }),
	});
	expect(response.status).toBe(503);
});

test("a CDP client cannot queue unbounded messages while its pane is rebuilt", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const RENDERER = 991;
	let releaseWake = () => {};
	const renderer = (request: PaneLayoutRendererRequest) => {
		releaseWake = () =>
			paneLayoutRequests.respond(
				{
					requestId: request.requestId,
					error: { code: "NOT_FOUND", message: "gone" },
				},
				RENDERER,
			);
	};
	paneLayoutRequests.addSubscriber(RENDERER);
	paneLayoutRequests.on("request", renderer);
	try {
		const url = new URL("/panes/slow-pane/cdp", bridge.endpoint);
		url.protocol = "ws:";
		url.searchParams.set("workspaceId", "ws-bridge");
		url.searchParams.set("token", bridge.secret);
		const socket = new WebSocket(url);
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		const closed = new Promise<number>((resolve) => {
			socket.onclose = (event) => resolve(event.code);
		});
		for (let i = 0; i < 65; i++)
			socket.send(JSON.stringify({ id: i, method: "Runtime.enable" }));
		expect(await closed).toBe(1009);
	} finally {
		releaseWake();
		paneLayoutRequests.off("request", renderer);
		paneLayoutRequests.removeSubscriber(RENDERER);
	}
});

test("the CLI manages the user's extensions only with the user's yes, and never opens one", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const post = (path: string, body: object) =>
		fetch(`${bridge.endpoint}${path}`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${bridge.secret}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		});
	const otherId = "a".repeat(32);
	const missingId = "b".repeat(32);

	userSays = false;
	expect(
		(await post("/extensions/install", { extensionId: otherId })).status,
	).toBe(403);
	expect(
		(await post("/extensions/remove", { extensionId: INSTALLED_ID })).status,
	).toBe(403);
	userSays = true;
	expect(
		await (await post("/extensions/install", { extensionId: otherId })).json(),
	).toMatchObject({ status: "installed" });

	expect(
		(await post("/extensions/remove", { extensionId: missingId })).status,
	).toBe(404);
	expect(
		(await post("/extensions/pin", { extensionId: "../../etc" })).status,
	).toBe(400);
	expect(
		(await post("/extensions/activate", { extensionId: INSTALLED_ID })).status,
	).toBe(404);
	await post("/extensions/pin", { extensionId: INSTALLED_ID, pinned: true });
	await post("/extensions/pin", { extensionId: INSTALLED_ID, pinned: false });
	expect(extensionCalls).toEqual([
		`install ${otherId}`,
		`remove ${INSTALLED_ID}`,
		`install ${otherId}`,
		`pin ${INSTALLED_ID} true`,
		`pin ${INSTALLED_ID} false`,
	]);

	userSays = "never answers";
	const unanswered = await post("/extensions/install", {
		extensionId: otherId,
	});
	expect(unanswered.status).toBe(408);
	expect((await unanswered.json()).error).toContain("Nothing changed");
});
