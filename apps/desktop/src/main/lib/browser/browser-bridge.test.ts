import { afterAll, beforeAll, expect, type mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dialog, session, webContents } from "electron";
import { AGENT_BROWSER_PARTITION, BROWSER_PARTITION } from "shared/constants";
import { startBrowserBridge, stopBrowserBridge } from "./browser-bridge";
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
	fakePane(902, AGENT_BROWSER_PARTITION);
	browserManager.register("user-pane", 901, "ws-bridge");
	browserManager.register("agent-pane", 902, "ws-bridge");
	await startBrowserBridge({ homeDir: home });
});

afterAll(async () => {
	await stopBrowserBridge();
	rmSync(home, { recursive: true, force: true });
	browserManager.unregister("user-pane");
	browserManager.unregister("agent-pane");
	fromIdMock.mockImplementation(preloadFromId ?? (() => null));
	fromPartitionMock.mockImplementation(preloadFromPartition ?? (() => ({})));
});

test("agents reach only the panes they opened, never the user's own browser", async () => {
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
	const evaluate = (paneId: string) =>
		call(`/panes/${paneId}/eval`, {
			method: "POST",
			body: JSON.stringify({
				workspaceId: "ws-bridge",
				code: "document.title",
			}),
		});
	const cdpClose = (paneId: string) =>
		new Promise<number>((resolve) => {
			const url = new URL(`/panes/${paneId}/cdp`, bridge.endpoint);
			url.protocol = "ws:";
			url.searchParams.set("workspaceId", "ws-bridge");
			url.searchParams.set("token", bridge.secret);
			const socket = new WebSocket(url);
			socket.onclose = (event) => resolve(event.code);
		});

	const listed = await (await call("/panes?workspaceId=ws-bridge")).json();
	expect(listed.panes.map((pane: { paneId: string }) => pane.paneId)).toEqual([
		"agent-pane",
	]);

	const userEval = await evaluate("user-pane");
	expect(userEval.status).toBe(403);
	expect(await userEval.text()).not.toContain("page data");
	expect(await (await evaluate("agent-pane")).json()).toEqual({
		result: "page data",
	});

	expect(await cdpClose("user-pane")).toBe(1008);
});

test("an agent copies the user's Chrome logins only after the user allows it", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	const showMessageBox = dialog.showMessageBox as unknown as ReturnType<
		typeof mock
	>;
	const importLogins = () =>
		fetch(`${bridge.endpoint}/panes/agent-pane/import-cookies`, {
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

test("an agent's open answers with its own pane, not a user pane that registers first", async () => {
	const bridge = getBrowserBridgeInfo();
	if (!bridge) throw new Error("the bridge did not start");
	fakePane(903, BROWSER_PARTITION);
	fakePane(904, AGENT_BROWSER_PARTITION);
	browserManager.once("open-request", () => {
		browserManager.register("late-user-pane", 903, "ws-bridge");
		browserManager.register("late-agent-pane", 904, "ws-bridge");
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
			}),
		});
		const body = await opened.json();
		expect(body.paneId).toBe("late-agent-pane");
		expect(body.title).toBe(AGENT_BROWSER_PARTITION);
	} finally {
		browserManager.unregister("late-user-pane");
		browserManager.unregister("late-agent-pane");
	}
});
