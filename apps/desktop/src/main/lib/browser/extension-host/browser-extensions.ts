import { settings } from "@superset/local-db";
import { type BrowserWindow, nativeImage } from "electron";
import type { ElectronChromeExtensions } from "electron-chrome-extensions";
import { uninstallExtension } from "electron-chrome-web-store";
import { localDb } from "main/lib/local-db";
import { createExtensionPins } from "./extension-pins";
import { isUserExtension } from "./user-extensions";
import { browserExtensionsPath } from "./web-store";

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
}): void {
	const actions = browserActionApi(options.extensions);
	host = { session: options.session, actions, tabOf: options.tabOf };
	actions.observers.add({
		isDestroyed: () => false,
		send: notifyBrowserExtensionsChanged,
	});
	options.session.extensions.on(
		"extension-loaded",
		notifyBrowserExtensionsChanged,
	);
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
		.filter((extension) => isUserExtension(extension, installRoot))
		.sort((a, b) => a.name.localeCompare(b.name));
	return Promise.all(
		installed.map(async (extension) => {
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
			};
		}),
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
	if (!host) return;
	const extension = host.session.extensions.getExtension(extensionId);
	if (!extension || !isUserExtension(extension, browserExtensionsPath())) {
		throw new Error(
			"Only extensions installed from the Web Store can be removed",
		);
	}
	await uninstallExtension(extensionId, {
		session: host.session,
		extensionsPath: browserExtensionsPath(),
	});
	await host.session.clearStorageData({
		origin: `chrome-extension://${extensionId}`,
	});
	pins.setPinned(extensionId, false);
	notifyBrowserExtensionsChanged();
}
