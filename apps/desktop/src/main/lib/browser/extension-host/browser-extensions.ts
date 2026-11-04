import { rm } from "node:fs/promises";
import path from "node:path";
import { settings } from "@superset/local-db";
import { type BrowserWindow, nativeImage } from "electron";
import type { ElectronChromeExtensions } from "electron-chrome-extensions";
import { uninstallExtension } from "electron-chrome-web-store";
import { localDb } from "main/lib/local-db";
import { deleteExtensionRules } from "./declarative-net-request";
import { createExtensionPins } from "./extension-pins";
import type { TurnedOffExtension } from "./load-user-extensions";
import { isUserExtension } from "./user-extensions";
import {
	browserExtensionsPath,
	installWebStoreExtension,
	userExtensionPaths,
} from "./web-store";

export type BadgeColor = readonly [r: number, g: number, b: number, a: number];

export interface BrowserExtension {
	id: string;
	name: string;
	version: string;
	/** PNG data URL of the toolbar icon as this pane's tab shows it. */
	icon: string | null;
	title: string;
	badge: { text: string; color: BadgeColor | null } | null;
	pinned: boolean;
	popupOpen: boolean;
	/** Not loaded: its files no longer match what the Web Store signed. */
	turnedOff: boolean;
}

export interface AnchorRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ActionDetails {
	title?: string;
	text?: string;
	color?: unknown;
	iconModified?: number;
}

interface BrowserActionApi {
	getState(): {
		actions: (ActionDetails & {
			id: string;
			tabs: Record<string, ActionDetails>;
		})[];
	};
	activate(
		event: { type: "frame"; sender: Electron.WebContents },
		details: {
			eventType: "click";
			extensionId: string;
			tabId: number;
			anchorRect: AnchorRect;
		},
	): void;
	handleCRXRequest(request: Pick<Request, "url">): Response;
	observers: Set<{ isDestroyed(): boolean; send(channel: string): void }>;
}

interface Host {
	session: Electron.Session;
	actions: BrowserActionApi;
	tabOf(paneId: string): Electron.WebContents | undefined;
	onRemoved(extensionId: string): void;
}

interface PopupRef {
	extensionId: string;
	paneId: string;
}

const BADGE_TEXT_MAX = 4;
const ICON_SIZE_PX = 32;
const ICON_CACHE_LIMIT = 200;
// A click on an open popup's own button blurs the popup first, which closes it
// before the click arrives; reopening it then would make the button unable to close it.
const POPUP_REOPEN_GUARD_MS = 300;

const pins = createExtensionPins(localDb, settings);
const listeners = new Set<() => void>();
const iconCache = new Map<string, string | null>();
const turnedOff = new Map<string, TurnedOffExtension>();
let host: Host | null = null;
let changeQueued = false;
let activating: PopupRef | null = null;
let openPopup: PopupRef | null = null;
let lastClosed: (PopupRef & { at: number }) | null = null;

// ponytail: getState, activate and observers are private in
// electron-chrome-extensions 4.10.0; they are the handlers its own
// <browser-action-list> calls over IPC. Swap to a public API if upstream adds one.
function browserActionApi(
	extensions: ElectronChromeExtensions,
): BrowserActionApi {
	const api = (
		extensions as unknown as {
			api?: { browserAction?: Partial<BrowserActionApi> };
		}
	).api?.browserAction;
	if (
		typeof api?.getState !== "function" ||
		typeof api.activate !== "function" ||
		typeof api.handleCRXRequest !== "function" ||
		!(api.observers instanceof Set)
	) {
		throw new Error(
			"electron-chrome-extensions no longer has the browser action API this host uses",
		);
	}
	return api as BrowserActionApi;
}

function samePopup(a: PopupRef | null, b: PopupRef): boolean {
	return a?.extensionId === b.extensionId && a.paneId === b.paneId;
}

export function notifyBrowserExtensionsChanged(): void {
	if (changeQueued) return;
	changeQueued = true;
	queueMicrotask(() => {
		changeQueued = false;
		for (const listener of listeners) listener();
	});
}

export function onBrowserExtensionsChanged(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function attachBrowserExtensions(options: {
	session: Electron.Session;
	extensions: ElectronChromeExtensions;
	tabOf: (paneId: string) => Electron.WebContents | undefined;
	onRemoved: (extensionId: string) => void;
}): void {
	const actions = browserActionApi(options.extensions);
	host = {
		session: options.session,
		actions,
		tabOf: options.tabOf,
		onRemoved: options.onRemoved,
	};
	actions.observers.add({
		isDestroyed: () => false,
		send: notifyBrowserExtensionsChanged,
	});
	options.session.extensions.on("extension-loaded", (_event, extension) => {
		if (turnedOff.delete(extension.id)) {
			deleteTurnedOffFiles(extension.id).catch((error: unknown) => {
				console.error(
					`[extension-host] Failed to delete ${extension.id}:`,
					error,
				);
			});
		}
		notifyBrowserExtensionsChanged();
	});
	options.session.extensions.on(
		"extension-unloaded",
		notifyBrowserExtensionsChanged,
	);
	options.extensions.on(
		"browser-action-popup-created",
		(popup: { extensionId: string; browserWindow?: BrowserWindow }) => {
			const opened = activating;
			if (opened?.extensionId !== popup.extensionId) return;
			openPopup = opened;
			notifyBrowserExtensionsChanged();
			popup.browserWindow?.once("closed", () => {
				if (openPopup !== opened) return;
				openPopup = null;
				lastClosed = { ...opened, at: Date.now() };
				notifyBrowserExtensionsChanged();
			});
		},
	);
}

function parseBadgeColor(value: unknown): BadgeColor | null {
	if (Array.isArray(value)) {
		const [r, g, b, a = 255] = value;
		return [r, g, b, a].every(
			(channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255,
		)
			? [r, g, b, a]
			: null;
	}
	if (typeof value !== "string") return null;
	const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
	if (!hex) return null;
	const digits =
		hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
	const channels = (digits.match(/../g) ?? []).map((pair) =>
		Number.parseInt(pair, 16),
	);
	const [r = 0, g = 0, b = 0, a = 255] = channels;
	return [r, g, b, a];
}

async function actionIcon(
	actions: BrowserActionApi,
	extension: Electron.Extension,
	tabId: number | undefined,
	iconModified: number | undefined,
): Promise<string | null> {
	const query = tabId === undefined ? "" : `?tabId=${tabId}`;
	const key = `${extension.id}@${extension.version}${query}#${iconModified ?? 0}`;
	const cached = iconCache.get(key);
	if (cached !== undefined) return cached;
	const response = actions.handleCRXRequest({
		url: `crx://extension-icon/${extension.id}/${ICON_SIZE_PX}${query}`,
	});
	let icon: string | null = null;
	if (response.ok) {
		const image = nativeImage.createFromBuffer(
			Buffer.from(await response.arrayBuffer()),
		);
		icon = (
			image.getSize().width > ICON_SIZE_PX
				? image.resize({ width: ICON_SIZE_PX, quality: "best" })
				: image
		).toDataURL();
	}
	if (iconCache.size >= ICON_CACHE_LIMIT) {
		const oldest = iconCache.keys().next().value;
		if (oldest !== undefined) iconCache.delete(oldest);
	}
	iconCache.set(key, icon);
	return icon;
}

export function setTurnedOffBrowserExtensions(
	extensions: TurnedOffExtension[],
): void {
	for (const extension of extensions) {
		if (!host?.session.extensions.getExtension(extension.id)) {
			turnedOff.set(extension.id, extension);
		}
	}
	notifyBrowserExtensionsChanged();
}

function deleteTurnedOffFiles(extensionId: string): Promise<void> {
	return rm(path.join(userExtensionPaths().turnedOffPath, extensionId), {
		recursive: true,
		force: true,
	});
}

function turnedOffEntry({
	id,
	name,
	version,
}: TurnedOffExtension): BrowserExtension {
	return {
		id,
		name,
		version,
		icon: null,
		title: name,
		badge: null,
		pinned: false,
		popupOpen: false,
		turnedOff: true,
	};
}

export async function listBrowserExtensions(
	paneId: string,
): Promise<BrowserExtension[]> {
	if (!host) return [];
	const { actions } = host;
	const tab = host.tabOf(paneId);
	const tabId = tab && !tab.isDestroyed() ? tab.id : undefined;
	const actionById = new Map(
		actions.getState().actions.map((action) => [action.id, action]),
	);
	const pinned = new Set(pins.pinnedIds());
	const installRoot = browserExtensionsPath();
	const installed = host.session.extensions
		.getAllExtensions()
		.filter((extension) => isUserExtension(extension, installRoot));
	const loaded = await Promise.all(
		installed.map(async (extension): Promise<BrowserExtension> => {
			const action = actionById.get(extension.id);
			const forTab = tabId === undefined ? undefined : action?.tabs[tabId];
			const state = { ...action, ...forTab };
			const text = (state.text ?? "").slice(0, BADGE_TEXT_MAX);
			return {
				id: extension.id,
				name: extension.name,
				version: extension.version,
				icon: await actionIcon(actions, extension, tabId, state.iconModified),
				title: state.title || extension.name,
				badge: text ? { text, color: parseBadgeColor(state.color) } : null,
				pinned: pinned.has(extension.id),
				popupOpen: samePopup(openPopup, { extensionId: extension.id, paneId }),
				turnedOff: false,
			};
		}),
	);
	return [...loaded, ...[...turnedOff.values()].map(turnedOffEntry)].sort(
		(a, b) => a.name.localeCompare(b.name),
	);
}

/** `anchor` is in the window's content coordinates, in DIP. */
export function activateBrowserExtension(
	paneId: string,
	extensionId: string,
	anchor: AnchorRect,
): void {
	const tab = host?.tabOf(paneId);
	if (!host || !tab || tab.isDestroyed()) return;
	const target = { extensionId, paneId };
	const closed = lastClosed;
	if (
		closed &&
		samePopup(closed, target) &&
		Date.now() - closed.at < POPUP_REOPEN_GUARD_MS
	) {
		return;
	}
	activating = target;
	try {
		host.actions.activate(
			{ type: "frame", sender: tab },
			{ eventType: "click", extensionId, tabId: tab.id, anchorRect: anchor },
		);
	} finally {
		activating = null;
	}
}

export function pinnedBrowserExtensionIds(): string[] {
	return pins.pinnedIds();
}

export function setBrowserExtensionPinned(
	extensionId: string,
	pinned: boolean,
): void {
	pins.setPinned(extensionId, pinned);
	notifyBrowserExtensionsChanged();
}

export async function removeBrowserExtension(
	extensionId: string,
): Promise<void> {
	if (!host) throw new Error("Browser extensions have not started yet");
	const { session, onRemoved } = host;
	const extension = session.extensions.getExtension(extensionId);
	if (!extension && turnedOff.has(extensionId)) {
		await deleteTurnedOffFiles(extensionId);
		turnedOff.delete(extensionId);
	} else if (extension && isUserExtension(extension, browserExtensionsPath())) {
		await uninstallExtension(extensionId, {
			session,
			extensionsPath: browserExtensionsPath(),
		});
	} else {
		throw new Error(
			"Only extensions installed from the Web Store can be removed",
		);
	}
	// The extension is gone; what it kept is forgotten even if a step fails.
	onRemoved(extensionId);
	pins.setPinned(extensionId, false);
	notifyBrowserExtensionsChanged();
	const cleanup = await Promise.allSettled([
		deleteExtensionRules(extensionId),
		session.clearStorageData({
			origin: `chrome-extension://${extensionId}`,
		}),
	]);
	for (const result of cleanup) {
		if (result.status === "rejected") throw result.reason;
	}
}

/** Downloads a fresh copy of a turned-off extension; its local data is kept. */
export async function reinstallBrowserExtension(
	extensionId: string,
	window: BrowserWindow | undefined,
): Promise<void> {
	if (!host || !turnedOff.has(extensionId)) return;
	await installWebStoreExtension(host.session, extensionId, window);
}
