import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const cjsPath = require.resolve("electron-chrome-extensions");
const bundles = [
	["cjs", cjsPath],
	["esm", join(dirname(cjsPath), "../esm/index.mjs")],
].map(([name, path]) => ({ name, source: readFileSync(path, "utf8") }));

type TabDetails = Record<string, unknown> & { id: number };
type WindowDetails = { id: number; tabs: TabDetails[] };
type Cookie = {
	name: string;
	value: string;
	domain: string;
	path: string;
	secure: boolean;
};
type Router = {
	handlers: Map<string, unknown>;
	listeners: Map<string, unknown[]>;
	session: unknown;
	handle(name: string, callback: () => unknown): void;
	broadcastEvent(eventName: string, ...args: unknown[]): void;
	sendEvent(extensionId: string, eventName: string, ...args: unknown[]): void;
	onExtensionMessage(
		event: object,
		extensionId: string,
		handlerName: string,
		...args: unknown[]
	): Promise<unknown>;
};
type FakeWindow = { id: number; isDestroyed(): boolean; destroy(): void };
type Store = {
	lastFocusedWindowId?: number;
	addWindow(window: FakeWindow): void;
	removeWindow(window: FakeWindow): Promise<void>;
	getCurrentWindow(): FakeWindow | null | undefined;
	requestPermissions(extension: object, request: object): Promise<boolean>;
};
type TabsApi = {
	onCreated(tabId: number): void;
	onUpdated(tabId: number): void;
	createTabDetails(tab: object): TabDetails;
};
type WindowsApi = { onCreated(windowId: number): void };
type WebNavigationApi = {
	onBeforeNavigate(
		tab: object,
		details: { url: string; isSameDocument: boolean; frame: object },
	): void;
};
type ApiClass<T = unknown> = new (ctx: object) => T;

function load(source: string) {
	const slice = (from: string, to: string) => {
		const start = source.indexOf(from);
		const end = source.indexOf(to, start);
		if (start < 0 || end < 0) throw new Error(`bundle has no '${from}'`);
		return source.slice(start, end);
	};
	const assertSenderIsExtension = new Function(
		`${slice("var senderExtensionId", "var RoutingDelegate")}; return assertSenderIsExtension;`,
	)() as (event: object, extensionId?: string) => void;
	const loaded = new Function(
		`const d3 = () => {}, d4 = () => {}, d5 = () => {}, d8 = () => {}, getAllWindows = () => [];
		const WindowsAPI = { WINDOW_ID_NONE: -1 };
		const electron = { webFrameMain: { fromId: () => undefined } };
		${slice("var validateExtensionUrl", "var getAllWindows")}
		${slice("var getSessionFromEvent", "var d8 =")}
		${slice("var getWindowState", "var WindowsAPI = _WindowsAPI;")}
		${slice("var _TabsAPI = class", "var TabsAPI = _TabsAPI;")}
		${slice("var getFrame = ", "// src/browser/store.ts")}
		${slice("var onChangedCauseTranslation", "// src/browser/api/notifications.ts")}
		${slice("var ExtensionRouter = class", "// src/browser/manifest.ts")}
		${slice("var ALL_SITE_PATTERNS", "// src/browser/index.ts")}
		return {
			ExtensionRouter,
			TabsAPI: _TabsAPI,
			WindowsAPI: _WindowsAPI,
			CookiesAPI,
			WebNavigationAPI,
			PermissionsAPI,
			rules: typeof extensionApiRules === "undefined" ? new Map() : extensionApiRules,
			grantActiveTab: typeof grantActiveTab === "undefined" ? () => {} : grantActiveTab,
		};`,
	)() as {
		ExtensionRouter: { prototype: Router };
		TabsAPI: ApiClass<TabsApi>;
		WindowsAPI: ApiClass<WindowsApi>;
		CookiesAPI: ApiClass;
		WebNavigationAPI: ApiClass<WebNavigationApi>;
		PermissionsAPI: ApiClass;
		rules: Map<string, unknown>;
		grantActiveTab: (extensionId: string, tabId: number, url: string) => void;
	};
	const storeStart = source.indexOf("var ExtensionStore = class");
	const ExtensionStore = new Function(
		"EventEmitter",
		`const import_node_events2 = { EventEmitter }, EventEmitter2 = EventEmitter;
		${source.slice(storeStart, source.indexOf("\n};\n", storeStart) + 3)}
		return ExtensionStore;`,
	)(EventEmitter) as new (
		impl: object,
	) => Store;
	return { assertSenderIsExtension, ExtensionStore, ...loaded };
}

const LASTPASS = "hdokiejnpimakedhajhdlcegeplioahd";
const OTHER = "bcjindcccaagfpapjjmafapmmgkkhgoa";
const URL_FIELDS = ["url", "title", "favIconUrl"];
const EVENTS = [
	"tabs.onCreated",
	"tabs.onUpdated",
	"windows.onCreated",
	"cookies.onChanged",
	"webNavigation.onBeforeNavigate",
	"webNavigation.onErrorOccurred",
	"browserAction.onClicked",
	"notifications.onClicked",
	"contextMenus.onClicked",
];

const fakeTab = (id: number, url: string, title: string) => {
	const frame = { url, processId: 1, frameTreeNodeId: 1, parent: null };
	return {
		id,
		url,
		title,
		getURL() {
			return this.url;
		},
		getTitle() {
			return this.title;
		},
		favicon: `${new URL(url).origin}/favicon.ico`,
		mainFrame: { framesInSubtree: [Object.assign(frame, { top: frame })] },
		audioMuted: false,
		isCurrentlyAudible: () => false,
		isLoading: () => false,
		isDestroyed: () => false,
		loadURL: async () => {},
		setAudioMuted: () => {},
		css: [] as string[],
		insertCSS(code: string) {
			this.css.push(code);
		},
	};
};

const cookieHost = (cookie: Cookie) => cookie.domain.replace(/^\./, "");

function fakeCookies() {
	const jar: Cookie[] = [
		{
			name: "sid",
			value: "mail-secret",
			domain: ".example.com",
			path: "/",
			secure: true,
		},
		{
			name: "session",
			value: "bank-secret",
			domain: "bank.test",
			path: "/",
			secure: true,
		},
	];
	const changeListeners: Array<(...args: unknown[]) => void> = [];
	const matches = (cookie: Cookie, url?: string, name?: string) =>
		(!name || cookie.name === name) &&
		(!url || new URL(url).hostname.endsWith(cookieHost(cookie)));
	const cookies = {
		get: async ({ url, name }: { url?: string; name?: string }) =>
			jar.filter((cookie) => matches(cookie, url, name)),
		set: async ({ url, name, value }: Record<string, string>) => {
			jar.push({
				name,
				value,
				domain: new URL(url).hostname,
				path: "/",
				secure: true,
			});
		},
		remove: async (url: string, name: string) => {
			const index = jar.findIndex((cookie) => matches(cookie, url, name));
			if (index >= 0) jar.splice(index, 1);
		},
		addListener: (_event: string, listener: (...args: unknown[]) => void) =>
			changeListeners.push(listener),
	};
	const cookieChanged = (cookie: Cookie) => {
		for (const listener of changeListeners)
			listener({}, cookie, "explicit", false);
	};
	return { jar, cookies, cookieChanged };
}

function extensionHost({
	ExtensionRouter,
	TabsAPI,
	WindowsAPI,
	CookiesAPI,
	WebNavigationAPI,
	PermissionsAPI,
}: ReturnType<typeof load>) {
	const mail = fakeTab(1, "https://mail.example.com/inbox", "Inbox (3)");
	const bank = fakeTab(
		2,
		"https://bank.test/login?next=https://www.example.com/",
		"Accounts",
	);
	const window = {
		id: 9,
		isDestroyed: () => false,
		getSize: () => [800, 600],
		getPosition: () => [0, 0],
		isFocused: () => true,
		isMaximized: () => false,
		isMinimized: () => false,
		isFullScreen: () => false,
		isAlwaysOnTop: () => false,
	};
	const extensions = new Map(
		Object.entries({
			none: { permissions: [] },
			tabs: { permissions: ["tabs"] },
			host: { permissions: [], host_permissions: ["*://*.example.com/*"] },
			otherHost: { permissions: ["https://example.com.evil.test/*"] },
			activeTab: { permissions: ["activeTab"] },
			allUrls: { permissions: [], host_permissions: ["<all_urls>"] },
			allUrlsOptional: {
				permissions: [],
				host_permissions: ["<all_urls>"],
				optional_permissions: ["cookies"],
			},
			cookies: {
				permissions: ["cookies"],
				host_permissions: ["https://*.example.com/*"],
			},
			cookiesOnly: { permissions: ["cookies"] },
			webNavigation: { permissions: ["webNavigation"] },
			notifications: { permissions: ["notifications"] },
			contextMenus: { permissions: ["contextMenus"] },
			optional: {
				permissions: [],
				optional_permissions: ["cookies"],
				optional_host_permissions: ["https://*.example.com/*"],
			},
		}).map(([id, manifest]) => [id, { id, manifest }]),
	);
	const { jar, cookies, cookieChanged } = fakeCookies();
	const session = {
		extensions: {
			getExtension: (id: string) => extensions.get(id),
			getAllExtensions: () => [...extensions.values()],
			on: () => {},
		},
		isPersistent: () => true,
		cookies,
	};
	const router = Object.create(ExtensionRouter.prototype) as Router;
	router.handlers = new Map();
	router.listeners = new Map();
	router.session = session;
	const store = {
		tabs: new Set([mail, bank]),
		windows: new Set([window]),
		tabDetailsCache: new Map<number, TabDetails>(),
		windowDetailsCache: new Map<number, WindowDetails>(),
		tabToWindow: new Map([
			[mail, window],
			[bank, window],
		]),
		lastFocusedWindowId: window.id,
		impl: {},
		getTabById: (id: number) => [mail, bank].find((tab) => tab.id === id),
		getWindowById: (id: number) => (id === window.id ? window : undefined),
		getLastFocusedWindow: () => window,
		getActiveTabFromWebContents: () => mail,
		getActiveTabOfCurrentWindow: () => mail,
		createTab: async () => bank,
		on: () => {},
		permissionAnswer: false,
		requestPermissions: async () => store.permissionAnswer,
	};
	const ctx = { store, router, session };
	const tabs = new TabsAPI(ctx);
	const windows = new WindowsAPI(ctx);
	new CookiesAPI(ctx);
	const navigation = new WebNavigationAPI(ctx);
	new PermissionsAPI(ctx);

	const call = (extensionId: string, handlerName: string, ...args: unknown[]) =>
		router.onExtensionMessage(
			{ type: "frame", sender: { session } },
			extensionId,
			handlerName,
			...args,
		);
	const received: Array<{
		eventName: string;
		extensionId: string;
		args: unknown[];
	}> = [];
	for (const eventName of EVENTS) {
		router.listeners.set(
			eventName,
			[...extensions.keys()].map((extensionId) => ({
				type: "frame",
				extensionId,
				host: {
					isDestroyed: () => false,
					send: (ipc: string, ...args: unknown[]) =>
						received.push({
							eventName: ipc.replace(/^crx-/, ""),
							extensionId,
							args,
						}),
				},
			})),
		);
	}
	const sent = (eventName: string, extensionId: string) =>
		received
			.filter(
				(event) =>
					event.eventName === eventName && event.extensionId === extensionId,
			)
			.map((event) => event.args);
	return {
		mail,
		bank,
		store,
		jar,
		router,
		tabs,
		windows,
		navigation,
		call,
		sent,
		cookieChanged,
	};
}

const visibleFields = (details: unknown) =>
	typeof details === "object" && details !== null
		? URL_FIELDS.filter((field) => field in details)
		: [];

describe.each(bundles)("$name bundle", ({ source }) => {
	const api = load(source);

	test("an extension message must come from the extension it names", () => {
		const { assertSenderIsExtension } = api;
		const page = {
			type: "frame",
			senderFrame: { url: `chrome-extension://${OTHER}/popup.html` },
		};
		const worker = {
			type: "service-worker",
			serviceWorker: { scope: `chrome-extension://${LASTPASS}/` },
		};
		const website = {
			type: "frame",
			senderFrame: { url: "https://example.com/" },
		};

		expect(() => assertSenderIsExtension(page, OTHER)).not.toThrow();
		expect(() => assertSenderIsExtension(worker, LASTPASS)).not.toThrow();
		expect(() => assertSenderIsExtension(page, undefined)).not.toThrow();
		expect(() => assertSenderIsExtension(page, LASTPASS)).toThrow(
			"does not match the sender",
		);
		expect(() => assertSenderIsExtension(website, LASTPASS)).toThrow(
			"does not match the sender",
		);
		expect(source).toContain(
			`assertSenderIsExtension(event, extensionId);\n      d8(\`received '\${handlerName}'\``,
		);
	});

	test("a tabs handler gives an extension a tab's URL and title only with permission", async () => {
		const { mail, bank, store, tabs, call } = extensionHost(api);
		const seen = async (extensionId: string) => {
			const queried = (await call(
				extensionId,
				"tabs.query",
				{},
			)) as TabDetails[];
			return Object.fromEntries(
				queried.map((tab) => [tab.id, visibleFields(tab).length > 0]),
			);
		};

		expect(await seen("tabs")).toEqual({ 1: true, 2: true });
		expect(await seen("host")).toEqual({ 1: true, 2: false });
		expect(await seen("activeTab")).toEqual({ 1: false, 2: false });
		api.grantActiveTab("activeTab", mail.id, mail.url);
		expect(await seen("activeTab")).toEqual({ 1: true, 2: false });
		mail.url = "https://phish.test/inbox";
		tabs.createTabDetails(mail);
		expect(await seen("activeTab")).toEqual({ 1: false, 2: false });
		mail.url = "https://mail.example.com/inbox";
		tabs.createTabDetails(mail);
		expect(await seen("otherHost")).toEqual({ 1: false, 2: false });
		expect(await seen("none")).toEqual({ 1: false, 2: false });

		for (const [handlerName, ...args] of [
			["tabs.get", bank.id],
			["tabs.getCurrent"],
			["tabs.getAllInWindow"],
			["tabs.create", {}],
			["tabs.update", mail.id, {}],
		] as const) {
			const result = [await call("none", handlerName, ...args)].flat();
			expect(result.length).toBeGreaterThan(0);
			for (const details of result) expect(visibleFields(details)).toEqual([]);
		}
		expect(
			await call("none", "tabs.query", { url: "*://bank.test/*" }),
		).toEqual([]);
		expect(await call("none", "tabs.query", { title: "Accounts" })).toEqual([]);
		expect(
			((await call("tabs", "tabs.query", { title: "Accounts" })) as unknown[])
				.length,
		).toBe(1);
		expect(store.tabDetailsCache.get(bank.id)?.url).toBe(bank.url);
	});

	test("activeTab starts only from a click on the extension's button or menu", () => {
		const activate = source.slice(
			source.indexOf("  activate({ type, sender }, details) {"),
			source.indexOf("  activateClick(details) {"),
		);
		const activateClick = source.slice(
			source.indexOf("  activateClick(details) {"),
			source.indexOf("  activateContextMenu(details) {"),
		);
		expect(activate).toContain(
			"grantActiveTab(extensionId, tab.id, tab.getURL());",
		);
		expect(activateClick).not.toContain("grantActiveTab");
		expect(source).not.toContain('handle("browserAction.activate"');
		expect(source).not.toContain('handle("browserAction.getState"');
		expect(source).toContain(
			'grantActiveTab(extensionId, tab.id, tab.url);\n    this.ctx.router.sendEvent(extensionId, "contextMenus.onClicked"',
		);
	});

	test("activeTab ends when the tab leaves the site, and a return does not bring it back", async () => {
		const { mail, tabs, call } = extensionHost(api);
		const seesMail = async () =>
			((await call("activeTab", "tabs.get", mail.id)) as TabDetails).url !==
			undefined;
		tabs.createTabDetails(mail);
		api.grantActiveTab("activeTab", mail.id, mail.url);
		expect(await seesMail()).toBe(true);

		mail.url = "https://phish.test/inbox";
		tabs.onUpdated(mail.id);
		mail.url = "https://mail.example.com/inbox";
		tabs.onUpdated(mail.id);
		expect(await seesMail()).toBe(false);
	});

	test("an extension styles only pages it may reach, and opens no file or data URL", async () => {
		const { mail, bank, call } = extensionHost(api);
		const style = { code: "input[value^=a] { background: url(//x.test/a) }" };

		await call("host", "tabs.insertCSS", mail.id, style);
		api.grantActiveTab("activeTab", mail.id, mail.url);
		await call("activeTab", "tabs.insertCSS", mail.id, style);
		bank.url = `chrome-extension://${LASTPASS}/vault.html`;
		for (const [extensionId, tab] of [
			["tabs", bank],
			["host", bank],
			["activeTab", bank],
			["allUrls", bank],
			["none", mail],
		] as const) {
			await expect(
				call(extensionId, "tabs.insertCSS", tab.id, style),
			).rejects.toThrow("Cannot access contents of the page");
		}
		expect(mail.css).toHaveLength(2);
		expect(bank.css).toHaveLength(0);

		for (const url of ["file:///etc/passwd", "data:text/html,<h1>hi</h1>"]) {
			await expect(call("tabs", "tabs.create", { url })).rejects.toThrow(
				"Invalid URL",
			);
		}
	});

	test("a tabs event gives each extension a tab's URL and title only with permission", () => {
		const { bank, tabs, sent } = extensionHost(api);
		tabs.onCreated(bank.id);
		bank.title = "Accounts - transfer";
		tabs.onUpdated(bank.id);

		const fieldsSent = (eventName: string, extensionId: string) =>
			sent(eventName, extensionId).map((args) => args.flatMap(visibleFields));
		expect(fieldsSent("tabs.onCreated", "tabs")).toEqual([URL_FIELDS]);
		expect(fieldsSent("tabs.onUpdated", "tabs")).toEqual([
			["title", ...URL_FIELDS],
		]);
		expect(fieldsSent("tabs.onCreated", "none")).toEqual([[]]);
		expect(fieldsSent("tabs.onUpdated", "none")).toEqual([]);
		expect(fieldsSent("tabs.onCreated", "host")).toEqual([[]]);
		expect(fieldsSent("tabs.onUpdated", "host")).toEqual([]);
	});

	test("a toolbar action event carries the tab's URL and title only with permission, and openPopup sends none", () => {
		const { mail, tabs, router, sent } = extensionHost(api);
		api.grantActiveTab("activeTab", mail.id, mail.url);
		for (const extensionId of ["none", "tabs", "activeTab"])
			router.sendEvent(extensionId, "browserAction.onClicked", {
				...tabs.createTabDetails(mail),
				pendingUrl: mail.url,
			});
		expect(
			sent("browserAction.onClicked", "none").flat().flatMap(visibleFields),
		).toEqual([]);
		expect(
			sent("browserAction.onClicked", "none")
				.flat()
				.some((details) => "pendingUrl" in (details as object)),
		).toBe(false);
		expect(
			sent("browserAction.onClicked", "tabs").flat().flatMap(visibleFields),
		).toEqual(URL_FIELDS);
		expect(
			sent("browserAction.onClicked", "activeTab")
				.flat()
				.flatMap(visibleFields),
		).toEqual(URL_FIELDS);

		const openPopup = source.slice(
			source.indexOf("this.openPopup = (event, options) => {"),
			source.indexOf("const handle = this.ctx.router.apiHandler();"),
		);
		expect(openPopup).toMatch(
			/if \(!this\.getPopupUrl\(event\.extension\.id, activeTab\.id\)\) return;\s+const \[width\]/,
		);
	});

	test("a window's tabs carry their URL and title only with permission", async () => {
		const { mail, bank, store, tabs, windows, call, sent } = extensionHost(api);
		for (const tab of [mail, bank]) tabs.createTabDetails(tab);
		const seen = async (extensionId: string) =>
			(
				(await call(extensionId, "windows.getAll", {
					populate: true,
				})) as WindowDetails[]
			).flatMap((window) =>
				window.tabs.map((tab) => visibleFields(tab).length > 0),
			);

		expect(await seen("tabs")).toEqual([true, true]);
		expect(await seen("host")).toEqual([true, false]);
		expect(await seen("none")).toEqual([false, false]);
		for (const handlerName of [
			"windows.get",
			"windows.getCurrent",
			"windows.getLastFocused",
		]) {
			const window = (await call("none", handlerName, 9)) as WindowDetails;
			expect(window.tabs.length).toBe(2);
			expect(window.tabs.flatMap(visibleFields)).toEqual([]);
		}

		windows.onCreated(9);
		const tabsSent = (extensionId: string) =>
			sent("windows.onCreated", extensionId).flatMap(([window]) =>
				(window as WindowDetails).tabs.map(
					(tab) => visibleFields(tab).length > 0,
				),
			);
		expect(tabsSent("tabs")).toEqual([true, true]);
		expect(tabsSent("none")).toEqual([false, false]);
		expect(store.windowDetailsCache.get(9)?.tabs[1]?.url).toBe(bank.url);
	});

	test("cookies need the cookies permission and a host permission for the cookie", async () => {
		const { jar, call, sent, cookieChanged } = extensionHost(api);
		const mailUrl = "https://mail.example.com/";
		const bankUrl = "https://bank.test/";
		for (const extensionId of ["none", "tabs", "host"]) {
			for (const [handlerName, details] of [
				["cookies.get", { url: mailUrl, name: "sid" }],
				["cookies.getAll", {}],
				["cookies.set", { url: mailUrl, name: "sid", value: "forged" }],
				["cookies.remove", { url: mailUrl, name: "sid" }],
				["cookies.getAllCookieStores", undefined],
			] as const) {
				await expect(call(extensionId, handlerName, details)).rejects.toThrow(
					"requires the cookies permission",
				);
			}
		}

		const names = (cookies: unknown) =>
			(cookies as Cookie[]).map((cookie) => cookie.name);
		expect(names(await call("cookies", "cookies.getAll", {}))).toEqual(["sid"]);
		expect(await call("cookiesOnly", "cookies.getAll", {})).toEqual([]);
		expect(
			await call("cookies", "cookies.get", { url: mailUrl, name: "sid" }),
		).toMatchObject({ value: "mail-secret" });
		expect(
			await call("cookies", "cookies.get", { url: bankUrl, name: "session" }),
		).toBeNull();
		await expect(
			call("cookies", "cookies.set", {
				url: bankUrl,
				name: "session",
				value: "forged",
			}),
		).rejects.toThrow("no host permission");
		await expect(
			call("cookies", "cookies.remove", { url: bankUrl, name: "session" }),
		).rejects.toThrow("no host permission");
		expect(
			await call("cookies", "cookies.set", {
				url: mailUrl,
				name: "theme",
				value: "dark",
			}),
		).toMatchObject({ value: "dark" });
		expect(jar.map((cookie) => cookie.value)).toEqual([
			"mail-secret",
			"bank-secret",
			"dark",
		]);

		for (const cookie of jar.slice(0, 2)) cookieChanged(cookie);
		const changed = (extensionId: string) =>
			sent("cookies.onChanged", extensionId).map(
				([info]) => (info as { cookie: Cookie }).cookie.name,
			);
		expect(changed("cookies")).toEqual(["sid"]);
		for (const extensionId of ["none", "tabs", "host", "cookiesOnly"]) {
			expect(changed(extensionId)).toEqual([]);
		}
	});

	test("webNavigation events and calls need the webNavigation permission", async () => {
		const { bank, navigation, call, sent } = extensionHost(api);
		const [frame] = bank.mainFrame.framesInSubtree;
		navigation.onBeforeNavigate(bank, {
			url: bank.url,
			isSameDocument: false,
			frame,
		});

		const urls = (extensionId: string) =>
			sent("webNavigation.onBeforeNavigate", extensionId).map(
				([details]) => (details as { url: string }).url,
			);
		expect(urls("webNavigation")).toEqual([bank.url]);
		for (const extensionId of ["none", "tabs", "host"]) {
			expect(urls(extensionId)).toEqual([]);
			await expect(
				call(extensionId, "webNavigation.getAllFrames", { tabId: bank.id }),
			).rejects.toThrow("requires the webNavigation permission");
			await expect(
				call(extensionId, "webNavigation.getFrame", {
					tabId: bank.id,
					frameId: 0,
				}),
			).rejects.toThrow("requires the webNavigation permission");
		}
		expect(
			await call("webNavigation", "webNavigation.getAllFrames", {
				tabId: bank.id,
			}),
		).toMatchObject([{ url: bank.url }]);
	});

	test("an unknown handler or event in a ruled namespace fails closed", async () => {
		const { router, call, sent } = extensionHost(api);
		router.handle("cookies.export", () => ["bank-secret"]);
		await expect(call("cookies", "cookies.export")).rejects.toThrow(
			"has no permission rule",
		);
		router.broadcastEvent("webNavigation.onErrorOccurred", {
			url: "https://bank.test/",
		});
		expect(sent("webNavigation.onErrorOccurred", "webNavigation")).toEqual([]);
	});

	test("desktop notifications need the notifications permission", async () => {
		const { router, call, sent } = extensionHost(api);
		router.handle("notifications.create", () => "shown");
		await expect(call("none", "notifications.create", {})).rejects.toThrow(
			"requires the notifications permission",
		);
		expect(await call("notifications", "notifications.create", {})).toBe(
			"shown",
		);
		for (const extensionId of ["none", "notifications"])
			router.sendEvent(extensionId, "notifications.onClicked", "note");
		expect(sent("notifications.onClicked", "none")).toEqual([]);
		expect(sent("notifications.onClicked", "notifications")).toEqual([
			["note"],
		]);
	});

	test("right-click menu items need the contextMenus permission", async () => {
		const { router, call, sent } = extensionHost(api);
		router.handle("contextMenus.create", () => "shown");
		await expect(call("none", "contextMenus.create", {})).rejects.toThrow(
			"requires the contextMenus permission",
		);
		expect(await call("contextMenus", "contextMenus.create", {})).toBe("shown");
		for (const extensionId of ["none", "contextMenus"])
			router.sendEvent(extensionId, "contextMenus.onClicked", "note");
		expect(sent("contextMenus.onClicked", "none")).toEqual([]);
		expect(sent("contextMenus.onClicked", "contextMenus")).toEqual([["note"]]);
	});

	test("every tabs, windows, cookies and webNavigation handler and event has a rule", () => {
		const handlers: string[] = [];
		const events: string[] = [];
		const ctx = {
			store: { on: () => {} },
			session: { cookies: { addListener: () => {} } },
			router: {
				apiHandler: () => (name: string) => handlers.push(name),
			},
		};
		for (const Api of [
			api.TabsAPI,
			api.WindowsAPI,
			api.CookiesAPI,
			api.WebNavigationAPI,
		] as ApiClass[]) {
			new Api(ctx);
			const classSource = Api.toString();
			for (const [, name] of classSource.matchAll(
				/(?:broadcastEvent|sendEvent)\((?:[\w.]+, )?"([\w.]+)"/g,
			))
				events.push(name);
			for (const [, name] of classSource.matchAll(
				/sendNavigationEvent\("(\w+)"/g,
			))
				events.push(`webNavigation.${name}`);
		}

		expect(handlers).toContain("cookies.getAll");
		expect(events).toContain("cookies.onChanged");
		expect(events).toContain("webNavigation.onCompleted");
		expect(
			[...handlers, ...events].filter((name) => !api.rules.has(name)),
		).toEqual([]);
	});

	test("a native app name cannot leave the native host folders", () => {
		const start = source.indexOf("var isNativeHostName");
		const lookup = source.indexOf(
			"async function readNativeMessagingHostConfig",
		);
		expect(start).toBeGreaterThan(0);
		const isNativeHostName = new Function(
			`${source.slice(start, lookup)}; return isNativeHostName;`,
		)() as (name: unknown) => boolean;
		for (const name of ["com.1password.1password", "com.lastpass.nplastpass"])
			expect(isNativeHostName(name)).toBe(true);
		for (const name of [
			"../browser-extensions/x/1_0/native-host",
			"com/evil",
			"com..evil",
			".com",
			"Com.Evil",
			"com\\evil",
			42,
		])
			expect(isNativeHostName(name)).toBe(false);
		expect(source.slice(lookup, lookup + 400)).toContain(
			"if (!isNativeHostName(application)) return;",
		);
		expect(source).toContain(
			"isValidConfig(config) && config.name === application",
		);
	});

	test("the current window moves to an open window when the focused one closes", async () => {
		const fakeWindow = (id: number): FakeWindow => {
			let destroyed = false;
			return {
				id,
				isDestroyed: () => destroyed,
				destroy: () => {
					destroyed = true;
				},
			};
		};
		const store = new api.ExtensionStore({});
		const [first, second] = [fakeWindow(1), fakeWindow(2)];
		store.addWindow(first);
		store.addWindow(second);
		store.lastFocusedWindowId = second.id;
		await store.removeWindow(second);
		expect(store.getCurrentWindow()).toBe(first);
		await store.removeWindow(first);
		expect(store.getCurrentWindow()).toBeFalsy();
	});

	test("with no window open, windows.getCurrent fails as in Chrome instead of answering null", async () => {
		const { store, call } = extensionHost(api);
		Object.assign(store, { getLastFocusedWindow: () => null });
		for (const handlerName of ["windows.getCurrent", "windows.getLastFocused"])
			await expect(call("none", handlerName)).rejects.toThrow(
				"No current window",
			);
		expect(source).toContain(
			"addWindow(window) {\n    this.ctx.store.addWindow(window);",
		);
	});

	test("permissions.request asks the app, grants only optional access, and the grant counts", async () => {
		const { store, call } = extensionHost(api);
		const cookieNames = async () =>
			((await call("optional", "cookies.getAll", {})) as Cookie[]).map(
				(cookie) => cookie.name,
			);
		const request = {
			permissions: ["cookies"],
			origins: ["https://*.example.com/*"],
		};
		await expect(cookieNames()).rejects.toThrow(
			"requires the cookies permission",
		);
		expect(await call("optional", "permissions.request", request)).toBe(false);
		await expect(cookieNames()).rejects.toThrow(
			"requires the cookies permission",
		);

		store.permissionAnswer = true;
		expect(await call("optional", "permissions.request", request)).toBe(true);
		expect(await cookieNames()).toEqual(["sid"]);
		expect(await call("optional", "permissions.contains", request)).toBe(true);
		await expect(
			call("optional", "permissions.request", {
				origins: ["https://bank.test/*"],
			}),
		).rejects.toThrow("not declared");

		expect(
			await call("optional", "permissions.remove", {
				permissions: ["cookies"],
			}),
		).toBe(true);
		await expect(cookieNames()).rejects.toThrow(
			"requires the cookies permission",
		);
		await expect(
			call("cookies", "permissions.remove", { permissions: ["cookies"] }),
		).rejects.toThrow("required");
		expect(await new api.ExtensionStore({}).requestPermissions({}, {})).toBe(
			false,
		);
	});

	test("a host pattern covers sites, never an API permission", async () => {
		const { call } = extensionHost(api);
		const ask = (request: object) =>
			call("allUrlsOptional", "permissions.request", request);

		expect(
			await call("allUrlsOptional", "permissions.contains", {
				permissions: ["cookies"],
			}),
		).toBe(false);
		expect(await ask({ permissions: ["cookies"] })).toBe(false);
		await expect(ask({ permissions: ["history"] })).rejects.toThrow(
			"not declared",
		);
		expect(
			await call("allUrlsOptional", "permissions.contains", {
				origins: ["https://any.test/*"],
			}),
		).toBe(true);
	});

	test("every event sent to an extension has a rule", () => {
		const unruled = [
			...source.matchAll(
				/(?:broadcastEvent|sendEvent)\((?:[\w.]+, )?"([\w.]+)"/g,
			),
		]
			.map(([, name]) => name)
			.filter((name) => !api.rules.has(name));
		expect(unruled).toEqual([]);
	});
});
