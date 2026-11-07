import { afterAll, beforeAll, expect, type mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dialog, session, webContents } from "electron";
import { AGENT_BROWSER_PARTITION, BROWSER_PARTITION } from "shared/constants";
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
	fakePane(902, AGENT_BROWSER_PARTITION);
	browserManager.register("user-pane", 901, "ws-bridge");
	browserManager.register("agent-pane", 902, "ws-bridge");
	await startBrowserBridge({ homeDir: home, extensions, answerDeadlineMs: 50 });
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
