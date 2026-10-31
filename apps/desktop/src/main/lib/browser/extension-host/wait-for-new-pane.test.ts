import { afterAll, expect, type mock, test } from "bun:test";
import { webContents } from "electron";
import { browserManager } from "../browser-manager";
import { waitForNewPane } from "./wait-for-new-pane";

const fromIdMock = webContents.fromId as unknown as ReturnType<typeof mock>;
const preloadFromId = fromIdMock.getMockImplementation();

afterAll(() => {
	browserManager.unregister("ext-agent-pane");
	browserManager.unregister("ext-user-pane");
	browserManager.unregister("ext-second-pane");
	fromIdMock.mockImplementation(preloadFromId ?? (() => null));
});

test("each of an extension's new tabs gets its own user pane, never an agent pane", async () => {
	const userSession = {} as Electron.Session;
	const fakePane = (paneSession: object) => ({
		session: paneSession,
		isDestroyed: () => false,
		getURL: () => "https://example.com/",
		getTitle: () => "",
		isLoading: () => false,
		setBackgroundThrottling: () => {},
		setWindowOpenHandler: () => {},
		on: () => {},
		off: () => {},
	});
	const panes = new Map<number, object>([
		[801, fakePane({})],
		[802, fakePane(userSession)],
		[803, fakePane(userSession)],
	]);
	fromIdMock.mockImplementation((id: number) => panes.get(id) ?? null);

	const opened = waitForNewPane("ws-ext", userSession);
	const openedNext = waitForNewPane("ws-ext", userSession);
	browserManager.register("ext-agent-pane", 801, "ws-ext");
	browserManager.register("ext-user-pane", 802, "ws-ext");
	browserManager.register("ext-second-pane", 803, "ws-ext");

	expect(await opened).toBe("ext-user-pane");
	expect(await openedNext).toBe("ext-second-pane");
});
