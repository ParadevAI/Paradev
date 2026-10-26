import { Database } from "bun:sqlite";
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { HostUsageObservation } from "shared/host-usage-observation";
import {
	DEFAULT_WIDGET_PREFERENCES,
	projectWidgetAccounts,
} from "shared/usage-widget/model";

let now = 1_800_000_000_000;
let sequence = 0;
const timers = new Map<
	number,
	{ at: number; callback: () => void; interval?: number }
>();
const schedule = (callback: () => void, delay = 0, interval?: number) => {
	const id = ++sequence;
	timers.set(id, { at: now + delay, callback, interval });
	return id;
};
globalThis.setTimeout = ((callback: () => void, delay = 0) =>
	schedule(callback, delay)) as unknown as typeof setTimeout;
globalThis.setInterval = ((callback: () => void, delay: number) =>
	schedule(callback, delay, delay)) as unknown as typeof setInterval;
globalThis.clearTimeout = ((id: number) =>
	timers.delete(id)) as unknown as typeof clearTimeout;
globalThis.clearInterval = globalThis.clearTimeout;
Date.now = () => now;
Reflect.set(process, "resourcesPath", "/fixture/resources");
Object.defineProperty(process, "platform", { value: "darwin" });
const denyNetwork = () => {
	throw new Error("Network access is forbidden in the native widget fixture");
};
globalThis.fetch = Object.assign(async () => denyNetwork(), {
	preconnect: denyNetwork,
});

async function advance(milliseconds: number) {
	const target = now + milliseconds;
	for (let count = 0; count < 100; count++) {
		const next = [...timers].sort((left, right) => left[1].at - right[1].at)[0];
		if (!next || next[1].at > target) break;
		const [id, task] = next;
		timers.delete(id);
		now = task.at;
		if (task.interval) timers.set(id, { ...task, at: now + task.interval });
		task.callback();
		for (let turn = 0; turn < 8; turn++) await Promise.resolve();
	}
	now = target;
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

class Contents extends EventEmitter {
	mainFrame = {};
	loading = false;
	messages: unknown[][] = [];
	openHandler?: () => { action: string };
	isLoading() {
		return this.loading;
	}
	send(...values: unknown[]) {
		this.messages.push(values);
	}
	setWindowOpenHandler(handler: () => { action: string }) {
		this.openHandler = handler;
	}
}
class Window extends EventEmitter {
	static instances: Window[] = [];
	id = ++sequence;
	webContents = new Contents();
	destroyed = false;
	visible = false;
	loads = 0;
	workspace?: { visible: boolean; options: unknown };
	ignoreMouse = false;
	bounds = { x: 0, y: 0, width: 392, height: 548 };
	constructor(readonly options: Record<string, unknown>) {
		super();
		Window.instances.push(this);
	}
	setAlwaysOnTop() {}
	setVisibleOnAllWorkspaces(visible: boolean, options: unknown) {
		this.workspace = { visible, options };
	}
	setIgnoreMouseEvents(ignore: boolean) {
		this.ignoreMouse = ignore;
	}
	setBounds(bounds: typeof this.bounds) {
		this.bounds = bounds;
	}
	getBounds() {
		return { ...this.bounds };
	}
	isVisible() {
		return this.visible;
	}
	isDestroyed() {
		return this.destroyed;
	}
	show() {
		this.visible = true;
	}
	showInactive() {
		this.visible = true;
	}
	hide() {
		this.visible = false;
	}
	focus() {}
	loadFile() {
		this.loads++;
		this.webContents.loading = true;
		return Promise.resolve();
	}
	loadURL() {
		return this.loadFile();
	}
	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.visible = false;
		this.emit("closed");
	}
	finish() {
		this.webContents.loading = false;
		this.webContents.emit("did-finish-load");
		this.webContents.emit("did-stop-loading");
	}
	fail(code = -6) {
		this.webContents.loading = false;
		this.webContents.emit(
			"did-fail-load",
			{},
			code,
			"fixture",
			"file://fixture",
			true,
		);
		this.webContents.emit("did-stop-loading");
	}
}
class ProviderTray extends EventEmitter {
	static instances: ProviderTray[] = [];
	destroyed = false;
	title = "";
	constructor(_image: unknown) {
		super();
		ProviderTray.instances.push(this);
	}
	setImage() {}
	setTitle(title: string) {
		this.title = title;
	}
	setToolTip() {}
	getBounds() {
		return { x: 30, y: 0, width: 20, height: 20 };
	}
	destroy() {
		this.destroyed = true;
	}
}
class Ipc extends EventEmitter {
	handlers = new Map<string, (...args: unknown[]) => unknown>();
	handle(name: string, handler: (...args: unknown[]) => unknown) {
		assert(!this.handlers.has(name));
		this.handlers.set(name, handler);
	}
	removeHandler(name: string) {
		this.handlers.delete(name);
	}
	invoke(
		name: string,
		sender: Contents,
		frame: object = sender.mainFrame,
		...args: unknown[]
	) {
		const handler = this.handlers.get(name);
		assert(handler, `Missing IPC ${name}`);
		return handler({ sender, senderFrame: frame }, ...args);
	}
}

const ipc = new Ipc();
const app = Object.assign(new EventEmitter(), {
	name: "Superset",
	isPackaged: true,
	getAppPath: () => "/fixture",
});
const powerMonitor = new EventEmitter();
const nativeTheme = Object.assign(new EventEmitter(), {
	shouldUseDarkColors: true,
});
const display = {
	id: 1,
	label: "Fixture",
	size: { width: 1440, height: 900 },
	bounds: { x: 0, y: 0, width: 1440, height: 900 },
	workArea: { x: 0, y: 24, width: 1440, height: 876 },
};
const screen = Object.assign(new EventEmitter(), {
	getAllDisplays: () => [display],
	getPrimaryDisplay: () => display,
	getDisplayMatching: () => display,
	getDisplayNearestPoint: () => display,
	getCursorScreenPoint: () => ({ x: 10, y: 10 }),
});
const image = {
	isEmpty: () => false,
	resize: () => image,
	toBitmap: () => Buffer.alloc(36 * 36 * 4),
	setTemplateImage: () => {},
};
mock.module("electron", () => ({
	app,
	BrowserWindow: Window,
	ipcMain: ipc,
	powerMonitor,
	nativeTheme,
	screen,
	Tray: ProviderTray,
	nativeImage: { createFromPath: () => image, createFromBitmap: () => image },
}));
mock.module("@lingui/core/macro", () => ({ msg: (value: unknown) => value }));
mock.module("@superset/i18n", () => ({
	i18n: { locale: "en", _: (value: { message: string }) => value.message },
}));
mock.module("@superset/i18n/format", () => ({
	formatNumber: (value: number) => String(value),
}));
const organizations = sqliteTable("organizations", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
});
const sqlite = new Database(":memory:");
sqlite.exec(
	"CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL); INSERT INTO organizations VALUES ('fixture-host', 'Fixture host');",
);
sqlite.exec(
	readFileSync(
		join(
			import.meta.dir,
			"../../../../../../packages/local-db/drizzle/0060_usage_widget_appearances.sql",
		),
		"utf8",
	),
);
mock.module("@superset/local-db", () => ({ organizations }));
mock.module("main/lib/local-db", () => ({ localDb: drizzle(sqlite) }));
const appState = {
	data: {
		usageWidget: {
			...structuredClone(DEFAULT_WIDGET_PREFERENCES),
			edge: true,
			menuBar: "providers",
		},
		themeState: { activeThemeId: "dark", customThemes: [] },
	},
	write: async () => {},
};
mock.module("main/lib/app-state", () => ({ appState }));
const coordinator = Object.assign(new EventEmitter(), {
	getActiveOrganizationIds: () => ["fixture-host"],
	getConnection: () => ({ port: 1234, secret: "fixture-only" }),
});
mock.module("main/lib/host-service-coordinator", () => ({
	getHostServiceCoordinator: () => coordinator,
}));
const authEvents = new EventEmitter();
mock.module("lib/trpc/routers/auth/utils/auth-functions", () => ({
	authEvents,
}));
let mainFocusCalls = 0;
mock.module("main/index", () => ({
	focusMainWindow: () => {
		mainFocusCalls++;
	},
}));
mock.module("main/lib/window-registry/window-registry", () => ({
	getAllWindows: () => [],
	getFocusedOrLastWindow: () => null,
	getOrg: (id: number) => (id === 1 ? "fixture-host" : null),
}));
mock.module("shared/env.shared", () => ({ env: { DESKTOP_VITE_PORT: 1234 } }));
const theme = {
	type: "dark",
	ui: {
		popoverForeground: "#ffffff",
		popover: "#111111",
		mutedForeground: "#aaaaaa",
		border: "#333333",
		accent: "#555555",
		destructive: "#ff0000",
	},
};
mock.module("shared/themes", () => ({
	darkTheme: theme,
	lightTheme: theme,
	getBuiltInTheme: () => theme,
}));
const observation: HostUsageObservation = {
	hostUrl: "http://127.0.0.1:1234",
	version: 1,
	loading: false,
	offline: false,
	data: [
		{
			agent: "claude",
			credentialKind: "subscription",
			accountKey: "fixture-source",
			sourceLabel: "Fixture",
			sourceId: "b".repeat(64),
			quotaIdentity: "a".repeat(64),
			email: null,
			plan: "Max",
			status: "ok",
			statusDetail: null,
			windows: [
				{
					id: "five_hour",
					label: "Session",
					usedPercent: 30,
					resetsAt: new Date(now + 60_000),
					windowSeconds: 18_000,
				},
			],
			creditsBalance: null,
			extraUsage: null,
			selection: null,
			isDefault: true,
			fetchedAt: new Date(now),
		},
	],
};
const subscribers = new Set<(value: HostUsageObservation) => void>();
let usageReads = 0;
const hostUsageObservations = {
	subscribe: (listener: (value: HostUsageObservation) => void) => {
		subscribers.add(listener);
		return () => {
			subscribers.delete(listener);
		};
	},
	peek: () => observation,
	read: async () => {
		usageReads++;
		for (const listener of subscribers) listener(observation);
		return observation;
	},
};
mock.module("main/lib/host-usage", () => ({
	hostUsageObservations,
}));
mock.module(join(import.meta.dir, "data.ts"), () => ({
	readUsageWidget: async () => {
		await hostUsageObservations.read();
		return {
			accounts: projectWidgetAccounts(observation.data ?? []),
			version: observation.version,
			claimResets: async () => [],
		};
	},
}));

if (process.argv[2] === "opt-in") {
	appState.data.usageWidget = {
		...appState.data.usageWidget,
		edge: false,
		menuBar: "off",
		celebrateResets: false,
	};
}
if (process.argv[2] === "appearance") {
	const healthy = observation.data?.[0];
	assert(healthy);
	observation.data = [
		healthy,
		{
			...healthy,
			accountKey: "fixture-expired",
			sourceId: "c".repeat(64),
			quotaIdentity: "d".repeat(64),
			status: "token_expired",
			windows: [],
		},
	];
}
const widget = await import("./index");
async function exercise() {
	widget.initUsageWidget(() => {});
	await advance(0);
	if (process.argv[2] === "opt-in") {
		app.emit("browser-window-focus", {}, { id: 1 });
		powerMonitor.emit("resume");
		powerMonitor.emit("unlock-screen");
		coordinator.emit("status-changed");
		authEvents.emit("token-saved");
		authEvents.emit("token-cleared");
		await advance(60_000);
		assert.equal(
			usageReads,
			0,
			"disabled usage surfaces never poll on startup, focus, wake, auth or timer events",
		);
		assert.equal(Window.instances.length, 0);
		assert.equal(ProviderTray.instances.length, 0);
		await widget.refreshUsageWidget(false);
		assert.equal(usageReads, 1, "an explicit get-style read remains available");
		assert.equal(widget.usageWidgetSnapshot().accounts.length, 1);
		await widget.refreshUsageWidget(true);
		assert.equal(usageReads, 2, "an explicit refresh remains available");
		return;
	}
	const panel = Window.instances[0];
	assert(panel);
	panel.finish();
	const accountId = widget.usageWidgetSnapshot().accounts[0]?.id;
	assert(accountId);
	const hover = async () => {
		ipc.emit(
			"usage-widget:hover",
			{ sender: panel.webContents, senderFrame: panel.webContents.mainFrame },
			accountId,
			70,
		);
		await advance(300);
		const preview = Window.instances.find((item) =>
			String(item.options.title).includes("preview"),
		);
		assert(preview);
		return preview;
	};
	switch (process.argv[2]) {
		case "appearance": {
			const expired = widget
				.usageWidgetSnapshot()
				.accounts.find((account) => account.status === "token_expired");
			assert(expired);
			widget.saveUsageWidgetAppearance(accountId, {
				color: "#228844",
				label: "Fixture work",
			});
			assert.equal(
				widget
					.usageWidgetSnapshot()
					.accounts.find((account) => account.id === accountId)?.color,
				"#228844",
			);
			assert.throws(() =>
				widget.saveUsageWidgetAppearance(expired.id, { color: "#ff0000" }),
			);
			assert.deepEqual(
				sqlite
					.query(
						"SELECT account_id, color, label FROM usage_widget_appearances",
					)
					.all(),
				[{ account_id: accountId, color: "#228844", label: "Fixture work" }],
			);
			break;
		}
		case "windows": {
			const preview = await hover();
			preview.finish();
			widget.previewUsageReset("weekly");
			const celebration = Window.instances[2];
			assert(celebration);
			for (const window of [panel, preview, celebration]) {
				assert.deepEqual(window.workspace, {
					visible: true,
					options: {
						visibleOnFullScreen: true,
						skipTransformProcessType: true,
					},
				});
				assert.deepEqual(window.options.webPreferences, {
					preload: join(import.meta.dir, "../preload/usage-widget.js"),
					contextIsolation: true,
					nodeIntegration: false,
					sandbox: true,
					partition: "usage-widget",
				});
				assert.equal(window.webContents.openHandler?.().action, "deny");
				let prevented = 0;
				const event = {
					preventDefault: () => {
						prevented++;
					},
				};
				window.webContents.emit("will-navigate", event);
				window.emit("page-title-updated", event);
				assert.equal(prevented, 2);
			}
			assert.equal(panel.isVisible(), true);
			assert.equal(preview.isVisible(), true);
			assert.equal(celebration.ignoreMouse, true);
			break;
		}
		case "recovery": {
			const preview = await hover();
			preview.fail();
			assert.equal(preview.isVisible(), false);
			await advance(500);
			assert.equal(
				preview.loads,
				2,
				"failed stop-loading must retain the scheduled retry",
			);
			preview.fail();
			await advance(500);
			preview.fail();
			await advance(500);
			assert.equal(
				preview.loads,
				3,
				"failed previews stop after two automatic reloads",
			);
			ipc.emit(
				"usage-widget:hover",
				{ sender: panel.webContents, senderFrame: panel.webContents.mainFrame },
				null,
			);
			await advance(180);
			await hover();
			await advance(500);
			assert.equal(
				preview.loads,
				4,
				"explicit hover recovers an exhausted automatic retry budget",
			);
			preview.finish();
			assert.equal(preview.isVisible(), true);
			preview.webContents.emit("render-process-gone", {}, { reason: "oom" });
			await advance(500);
			assert.equal(preview.loads, 4, "OOM never triggers automatic reload");
			await hover();
			await advance(500);
			assert.equal(preview.loads, 5, "explicit hover can recover OOM");
			preview.fail(-3);
			await advance(500);
			assert.equal(
				preview.loads,
				5,
				"aborted loads do not cause an automatic retry",
			);
			break;
		}
		case "ipc": {
			const outsider = new Contents();
			assert.throws(() => ipc.invoke("usage-widget:snapshot", outsider));
			assert.throws(() =>
				ipc.invoke("usage-widget:snapshot", panel.webContents, {}),
			);
			await assert.rejects(
				Promise.resolve().then(() =>
					ipc.invoke(
						"usage-widget:action",
						outsider,
						outsider.mainFrame,
						"expand",
					),
				),
			);
			await assert.rejects(
				Promise.resolve().then(() =>
					ipc.invoke(
						"usage-widget:visibility",
						panel.webContents,
						{},
						accountId,
						true,
					),
				),
			);
			await ipc.invoke(
				"usage-widget:action",
				panel.webContents,
				panel.webContents.mainFrame,
				"expand",
			);
			ipc.emit(
				"usage-widget:resize",
				{ sender: outsider, senderFrame: outsider.mainFrame },
				160,
			);
			assert.equal(widget.usageWidgetSnapshot().panelHeight, 548);
			ipc.emit(
				"usage-widget:resize",
				{ sender: panel.webContents, senderFrame: panel.webContents.mainFrame },
				222,
			);
			assert.equal(widget.usageWidgetSnapshot().panelHeight, 222);
			widget.disposeUsageWidget();
			assert.equal(ipc.handlers.size, 0);
			assert.equal(ipc.eventNames().length, 0);
			assert.equal(subscribers.size, 0);
			assert.equal(screen.eventNames().length, 0);
			assert.equal(coordinator.eventNames().length, 0);
			assert.equal(timers.size, 0);
			assert(Window.instances.every((item) => item.destroyed));
			assert(ProviderTray.instances.every((item) => item.destroyed));
			const count = Window.instances.length;
			widget.previewUsageReset("weekly");
			assert.equal(
				Window.instances.length,
				count,
				"a disposed widget cannot create another celebration",
			);
			break;
		}
		default:
			throw new Error("Unknown native widget scenario");
	}
}
try {
	await exercise();
	assert.equal(mainFocusCalls, 0);
	console.log(`native-widget:${process.argv[2]}:passed`);
} finally {
	widget.disposeUsageWidget();
	sqlite.close();
}
