import { join } from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { formatNumber } from "@superset/i18n/format";
import { organizations } from "@superset/local-db";
import { eq } from "drizzle-orm";
import {
	app,
	BrowserWindow,
	ipcMain,
	nativeTheme,
	powerMonitor,
	screen,
	Tray,
} from "electron";
import { authEvents } from "lib/trpc/routers/auth/utils/auth-functions";
import { focusMainWindow } from "main/index";
import { appState } from "main/lib/app-state";
import { getHostServiceCoordinator } from "main/lib/host-service-coordinator";
import { hostUsageObservations } from "main/lib/host-usage";
import { localDb } from "main/lib/local-db";
import {
	getAllWindows,
	getFocusedOrLastWindow,
	getOrg,
} from "main/lib/window-registry/window-registry";
import { env } from "shared/env.shared";
import type { HostUsageObservation } from "shared/host-usage-observation";
import { darkTheme, getBuiltInTheme, lightTheme } from "shared/themes";
import {
	edgeAccounts,
	edgeHandleLayout,
	hasCurrentUsage,
	isCurrentWindow,
	isFresh,
	metricValue,
	PROVIDER_NAMES,
	panelBounds,
	preferredWindow,
	projectWidgetAccounts,
	readWidgetPreferences,
	selectedAccount,
	setWidgetAccountHidden,
	type WidgetPreferences,
	type WidgetProvider,
	type WidgetSnapshot,
	widgetAccountLabel,
	widgetPreferencesSchema,
} from "shared/usage-widget/model";
import {
	createWidgetAppearanceStore,
	widgetAppearancePatchSchema,
} from "./appearance";
import { readUsageWidget } from "./data";
import { EdgeTransition } from "./edge-transition";
import { HoverIntent, pointInsideBounds } from "./hover-intent";
import { providerTrayIcon } from "./provider-tray-icon";
import { RefreshQueue } from "./refresh-queue";
import { isAbortedLoad, RendererRecovery } from "./renderer-recovery";
import {
	closeResetCelebration,
	resetCelebrationActive,
	resetCelebrationFor,
	showResetCelebration,
} from "./reset-celebration";

let window: BrowserWindow | null = null;
let hoverWindow: BrowserWindow | null = null;
let hoverDocumentReady = false;
let windowRecovery: RendererRecovery | null = null;
let hoverRecovery: RendererRecovery | null = null;
let hoverAnchor: { id: string; centerY: number } | null = null;
const hoverIntent = new HoverIntent(
	showHover,
	() => hoverWindow?.hide(),
	() => {
		if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible())
			return false;
		try {
			return pointInsideBounds(
				screen.getCursorScreenPoint(),
				hoverWindow.getBounds(),
			);
		} catch {
			return false;
		}
	},
);
let running = false;
const refreshQueue = new RefreshQueue(refresh);
let revision = 0;
let lastManual = 0;
let panelHeight = 548;
const edgeTransition = new EdgeTransition(() => {
	position();
	publish();
});
let timer: ReturnType<typeof setInterval> | undefined;
let updateLogo: (() => void) | undefined;
let anchor = { x: 0, y: 0, width: 0, height: 0 };
let state: Pick<
	WidgetSnapshot,
	| "accounts"
	| "hosts"
	| "hostId"
	| "loading"
	| "offline"
	| "inventoryUnavailable"
	| "expanded"
	| "provider"
	| "surface"
> = {
	accounts: [],
	hosts: [],
	hostId: null,
	loading: false,
	offline: false,
	inventoryUnavailable: false,
	expanded: true,
	provider: null,
	surface: "menu",
};
const providerTrays = new Map<WidgetProvider, Tray>();
const snapshotListeners = new Set<(snapshot: WidgetSnapshot) => void>();
let publishedMetadata: {
	accounts: WidgetSnapshot["accounts"];
	preferences: unknown;
	hostId: string | null;
	loading: boolean;
	offline: boolean;
} | null = null;
const appearanceStore = createWidgetAppearanceStore({
	db: localDb,
	getOrganizationId: () => state.hostId,
	getInventory: (hostId) =>
		hostId === state.hostId
			? {
					accounts: state.accounts.filter(
						(account) =>
							isFresh(account, state.offline) ||
							hasCurrentUsage(account, state.offline),
					),
					fresh: !state.offline && !state.loading,
					complete: false,
				}
			: null,
});
export function subscribeUsageWidget(
	listener: (snapshot: WidgetSnapshot) => void,
) {
	snapshotListeners.add(listener);
	return () => {
		snapshotListeners.delete(listener);
	};
}
export function saveUsageWidgetAppearance(accountId: string, patch: unknown) {
	const hostId = state.hostId;
	if (!hostId) throw new Error("Usage host unavailable");
	appearanceStore.writeWidgetAppearance(
		hostId,
		accountId,
		widgetAppearancePatchSchema.parse(patch),
	);
	const connection = getHostServiceCoordinator().getConnection(hostId);
	const observation =
		connection &&
		hostUsageObservations.peek(`http://127.0.0.1:${connection.port}`);
	if (observation) acceptUsageObservation(observation);
	return usageWidgetSnapshot();
}
let preferencesPending: Promise<unknown> = Promise.resolve();
function changePreferences(action: () => Promise<WidgetSnapshot>) {
	const result = preferencesPending.then(action);
	preferencesPending = result.catch(() => {});
	return result;
}
export function setUsageWidgetAccountHidden(
	accountId: string | null,
	hidden: boolean,
) {
	return changePreferences(() =>
		writeUsageWidgetPreferences({
			hiddenAccountIds:
				accountId === null && !hidden
					? []
					: setWidgetAccountHidden(
							state.accounts,
							preferences(),
							accountId ?? "",
							hidden,
						),
		}),
	);
}
const preferences = () => readWidgetPreferences(appState.data.usageWidget);
function displayEnabled() {
	const prefs = preferences();
	return prefs.menuBar !== "off" || prefs.edge || prefs.celebrateResets;
}
export function usageWidgetSnapshot(): WidgetSnapshot {
	const prefs = preferences();
	const hostId = state.hostId;
	const connection = hostId
		? getHostServiceCoordinator().getConnection(hostId)
		: null;
	const display =
		screen.getAllDisplays().find((d) => d.id === prefs.displayId) ??
		screen.getPrimaryDisplay();
	const settings = appState.data.themeState;
	const id =
		settings.activeThemeId === "system"
			? nativeTheme.shouldUseDarkColors
				? (settings.systemDarkThemeId ?? "dark")
				: (settings.systemLightThemeId ?? "light")
			: settings.activeThemeId;
	const theme =
		settings.customThemes.find((t) => t.id === id) ??
		getBuiltInTheme(id) ??
		(nativeTheme.shouldUseDarkColors ? darkTheme : lightTheme);
	const colors = {
		foreground: theme.ui.popoverForeground,
		popover: theme.ui.popover,
		"muted-foreground": theme.ui.mutedForeground,
		border: theme.ui.border,
		accent: theme.ui.accent,
		destructive: theme.ui.destructive,
	};
	return {
		...state,
		hostUrl: connection ? `http://127.0.0.1:${connection.port}` : null,
		panelHeight,
		edgeTransition: edgeTransition.current,
		edgeLayout: edgeHandleLayout(
			edgeAccounts(state.accounts, prefs).length,
			display.workArea,
		),
		colors,
		preferences: prefs,
		locale: i18n.locale || "en",
		dark: theme.type === "dark",
		displays:
			process.platform === "darwin"
				? screen.getAllDisplays().map((d) => ({
						id: d.id,
						label: d.label || `${d.size.width} × ${d.size.height}`,
					}))
				: [],
	};
}
function publish() {
	if (!running) return;
	if (
		state.surface === "edge" &&
		!state.expanded &&
		edgeTransition.current === null
	)
		position();
	if (
		hoverIntent.current &&
		!edgeAccounts(state.accounts, preferences()).some(
			(a) => a.id === hoverIntent.current,
		)
	)
		hoverIntent.close();
	if (window && !window.isDestroyed())
		window.webContents.send("usage-widget:changed", usageWidgetSnapshot());
	if (hoverWindow && !hoverWindow.isDestroyed() && hoverIntent.current)
		hoverWindow.webContents.send("usage-widget:changed", {
			...usageWidgetSnapshot(),
			preview: hoverIntent.current,
		});
	updateProviderTrays();
	const metadata = {
		accounts: state.accounts,
		preferences: appState.data.usageWidget,
		hostId: state.hostId,
		loading: state.loading,
		offline: state.offline,
	};
	if (
		!publishedMetadata ||
		metadata.accounts !== publishedMetadata.accounts ||
		metadata.preferences !== publishedMetadata.preferences ||
		metadata.hostId !== publishedMetadata.hostId ||
		metadata.loading !== publishedMetadata.loading ||
		metadata.offline !== publishedMetadata.offline
	) {
		publishedMetadata = metadata;
		const snapshot = usageWidgetSnapshot();
		for (const listener of snapshotListeners) {
			try {
				listener(snapshot);
			} catch {
				/* Closed subscribers do not block the display. */
			}
		}
	}
}
function selectedHost() {
	const manager = getHostServiceCoordinator();
	const ids = manager.getActiveOrganizationIds();
	const main = getFocusedOrLastWindow();
	const active = main ? getOrg(main.id) : null;
	const wanted = preferences().hostId;
	return wanted
		? ids.includes(wanted)
			? wanted
			: null
		: active && ids.includes(active)
			? active
			: (ids[0] ?? null);
}
export function refreshUsageWidget(force = false): Promise<void> {
	return refreshQueue.request(force);
}
async function refresh(force: boolean): Promise<void> {
	if (!running) return;
	const hostId = selectedHost();
	const generation = revision;
	if (hostId !== state.hostId)
		state = {
			...state,
			hostId,
			accounts: [],
			offline: false,
			inventoryUnavailable: false,
		};
	const manager = getHostServiceCoordinator();
	state.hosts = manager.getActiveOrganizationIds().map((id) => {
		let label =
			state.hosts.find((host) => host.id === id)?.label ?? id.slice(0, 8);
		try {
			label =
				localDb
					.select({ name: organizations.name })
					.from(organizations)
					.where(eq(organizations.id, id))
					.get()?.name ?? label;
		} catch {
			/* Optional labels do not gate quota. */
		}
		return { id, label };
	});
	const connection = hostId ? manager.getConnection(hostId) : null;
	if (!connection || !hostId) {
		state = { ...state, loading: false, offline: true };
		publish();
		return;
	}
	const manual = force && Date.now() - lastManual > 30_000;
	if (manual) lastManual = Date.now();
	state.loading = true;
	publish();

	try {
		const result = await readUsageWidget(
			connection,
			manual,
			appearanceStore.readWidgetAppearances(hostId),
		);
		if (!running || generation !== revision || hostId !== selectedHost())
			return;
		if (
			hostUsageObservations.peek(`http://127.0.0.1:${connection.port}`)
				?.version !== result.version
		)
			return;
		if (preferences().celebrateResets && !resetCelebrationActive()) {
			const eligible = result.accounts.filter(
				(a) =>
					!a.identityChanged &&
					a.status === "ok" &&
					!preferences().hiddenAccountIds.includes(a.id) &&
					a.resetNotice,
			);
			const notices = eligible.length
				? await result
						.claimResets(
							[
								...new Set(
									eligible
										.map((a) => a.resetNotice?.id)
										.filter((id): id is string => !!id),
								),
							].slice(0, 512),
						)
						.catch(() => [])
				: [];
			if (
				notices.length &&
				running &&
				generation === revision &&
				hostId === selectedHost()
			) {
				const kind = notices.some((n) => n.kind === "weekly")
					? "weekly"
					: "session";
				const account = eligible.find((a) =>
					notices.some((n) => n.id === a.resetNotice?.id && n.kind === kind),
				);
				const label = account
					? widgetAccountLabel(account, 0, preferences().hideEmails)
					: "";
				const labelWithCount =
					notices.length > 1
						? `${label} +${formatNumber(notices.length - 1)}`
						: label;
				showResetCelebration(
					{ kind, label: labelWithCount },
					preferences().displayId,
				);
			}
		}
	} catch {
		if (generation === revision)
			state.offline =
				hostUsageObservations.peek(`http://127.0.0.1:${connection.port}`)
					?.offline ?? true;
	} finally {
		if (generation === revision) {
			state.loading =
				hostUsageObservations.peek(`http://127.0.0.1:${connection.port}`)
					?.loading ?? false;
			publish();
		}
	}
}
export function saveUsageWidgetPreferences(patch: Partial<WidgetPreferences>) {
	return changePreferences(() => writeUsageWidgetPreferences(patch));
}
async function writeUsageWidgetPreferences(patch: Partial<WidgetPreferences>) {
	hoverIntent.close();
	const prior = preferences();
	const next = widgetPreferencesSchema.parse({ ...prior, ...patch });
	appState.data.usageWidget = next;
	try {
		await appState.write();
	} catch (error) {
		appState.data.usageWidget = prior;
		throw error;
	}
	if (!next.celebrateResets || next.hostId !== prior.hostId)
		closeResetCelebration();
	if (next.hostId !== prior.hostId) {
		revision++;
		state.accounts = [];
		state.hostId = null;
	}
	updateLogo?.();
	if (next.edge !== prior.edge) configureEdge();
	else position();
	publish();
	void refreshUsageWidget();
	return usageWidgetSnapshot();
}
function createPanel() {
	if (window && !window.isDestroyed()) return window;
	const panel = new BrowserWindow({
		title: `${app.name} — Usage`,
		type: "panel",
		hiddenInMissionControl: true,
		width: 392,
		height: 548,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		resizable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		skipTaskbar: true,
		hasShadow: false,
		roundedCorners: false,
		alwaysOnTop: true,
		webPreferences: {
			preload: join(__dirname, "../preload/usage-widget.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			partition: "usage-widget",
		},
	});
	window = panel;
	panel.setAlwaysOnTop(true, "pop-up-menu");
	panel.setVisibleOnAllWorkspaces(true, {
		visibleOnFullScreen: true,
		skipTransformProcessType: process.platform === "darwin",
	});
	panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	panel.webContents.on("will-navigate", (event) => event.preventDefault());
	panel.on("page-title-updated", (event) => event.preventDefault());
	panel.webContents.on("before-input-event", (event, input) => {
		if (input.key === "Escape") {
			event.preventDefault();
			closePanel();
		}
	});
	panel.on("blur", () => {
		if (state.expanded && state.surface === "menu") closePanel();
	});
	panel.on("closed", () => {
		recovery.dispose();
		if (window === panel) {
			window = null;
			windowRecovery = null;
		}
	});
	const load = () =>
		app.isPackaged
			? panel.loadFile(join(__dirname, "../renderer/usage-widget.html"))
			: panel.loadURL(
					`http://localhost:${env.DESKTOP_VITE_PORT}/usage-widget.html`,
				);
	const recovery = new RendererRecovery(
		load,
		() => running && window === panel && !panel.isDestroyed(),
	);
	windowRecovery = recovery;
	panel.webContents.on("render-process-gone", (_event, details) => {
		console.warn("[usage-widget] Renderer process gone", details);
		recovery.failed(details.reason !== "oom");
	});
	panel.webContents.on(
		"did-fail-load",
		(_event, code, _description, _url, main) => {
			if (main && code !== -3) recovery.failed();
		},
	);
	panel.webContents.on("did-finish-load", () => {
		recovery.loaded();
		publish();
		position();
	});
	void load().catch((error: unknown) => {
		if (!isAbortedLoad(error)) recovery.failed();
	});
	return panel;
}
function showHover(accountId: string) {
	if (
		!running ||
		state.surface !== "edge" ||
		state.expanded ||
		edgeTransition.current !== null ||
		!preferences().edge ||
		!window?.isVisible()
	) {
		hoverIntent.close();
		return;
	}
	if (!hoverWindow || hoverWindow.isDestroyed()) {
		hoverDocumentReady = false;
		const preview = new BrowserWindow({
			title: `${app.name} — Usage preview`,
			type: "panel",
			width: 284,
			height: 204,
			show: false,
			frame: false,
			transparent: true,
			backgroundColor: "#00000000",
			resizable: false,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			focusable: false,
			skipTaskbar: true,
			hiddenInMissionControl: true,
			hasShadow: false,
			alwaysOnTop: true,
			roundedCorners: false,
			webPreferences: {
				preload: join(__dirname, "../preload/usage-widget.js"),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true,
				partition: "usage-widget",
			},
		});
		hoverWindow = preview;
		preview.setAlwaysOnTop(true, "pop-up-menu");
		preview.setVisibleOnAllWorkspaces(true, {
			visibleOnFullScreen: true,
			skipTransformProcessType: process.platform === "darwin",
		});
		preview.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		preview.webContents.on("will-navigate", (event) => event.preventDefault());
		preview.on("page-title-updated", (event) => event.preventDefault());
		preview.on("closed", () => {
			recovery.dispose();
			if (hoverWindow === preview) {
				hoverWindow = null;
				hoverRecovery = null;
				hoverDocumentReady = false;
			}
		});
		const load = () => {
			hoverDocumentReady = false;
			return app.isPackaged
				? preview.loadFile(join(__dirname, "../renderer/usage-widget.html"))
				: preview.loadURL(
						`http://localhost:${env.DESKTOP_VITE_PORT}/usage-widget.html`,
					);
		};
		const recovery = new RendererRecovery(
			load,
			() => running && hoverWindow === preview && !preview.isDestroyed(),
		);
		hoverRecovery = recovery;
		preview.webContents.on("render-process-gone", (_event, details) => {
			hoverDocumentReady = false;
			hoverIntent.close();
			recovery.failed(details.reason !== "oom");
		});
		preview.webContents.on(
			"did-fail-load",
			(_event, code, _description, _url, main) => {
				if (main && code !== -3) {
					hoverDocumentReady = false;
					preview.hide();
					recovery.failed();
				}
			},
		);
		preview.webContents.on("did-finish-load", () => {
			if (hoverWindow !== preview || preview.isDestroyed()) return;
			hoverDocumentReady = true;
			recovery.loaded();
		});
		preview.webContents.on("did-stop-loading", () => {
			if (hoverWindow === preview && hoverDocumentReady && hoverIntent.current)
				showHover(hoverIntent.current);
		});
		void load().catch((error: unknown) => {
			if (!isAbortedLoad(error)) {
				hoverDocumentReady = false;
				recovery.failed();
			}
		});
	}
	hoverRecovery?.retry();
	const notch = window.getBounds();
	const area = screen.getDisplayMatching(notch).workArea;
	const index = edgeAccounts(state.accounts, preferences()).findIndex(
		(a) => a.id === accountId,
	);
	if (index < 0) {
		hoverIntent.close();
		return;
	}
	const height = Math.min(204, area.height);
	const width = Math.min(284, area.width);
	const center =
		notch.y +
		Math.max(
			0,
			Math.min(
				notch.height,
				hoverAnchor?.id === accountId ? hoverAnchor.centerY : 41 + index * 52,
			),
		);
	// Include the gap in the transparent preview window so crossing into it keeps the hover alive.
	hoverWindow.setBounds({
		x: Math.max(area.x, notch.x - width),
		y: Math.max(
			area.y,
			Math.min(center - Math.round(height / 2), area.y + area.height - height),
		),
		width,
		height,
	});
	if (hoverDocumentReady && !hoverWindow.webContents.isLoading()) {
		publish();
		hoverWindow.showInactive();
	}
}
function hoverUsage(
	event: Electron.IpcMainEvent,
	accountId: unknown,
	centerY: unknown,
) {
	const source = event.sender;
	if (
		(source !== window?.webContents && source !== hoverWindow?.webContents) ||
		event.senderFrame !== source.mainFrame
	)
		return;
	if (
		state.surface !== "edge" ||
		state.expanded ||
		edgeTransition.current !== null ||
		!preferences().edge
	)
		return;
	if (accountId === null) hoverIntent.leave();
	else if (
		typeof accountId === "string" &&
		edgeAccounts(state.accounts, preferences()).some((a) => a.id === accountId)
	) {
		if (
			source === hoverWindow?.webContents &&
			accountId !== hoverIntent.current
		)
			return;
		if (source === window?.webContents) {
			if (typeof centerY !== "number" || !Number.isFinite(centerY)) return;
			hoverAnchor = { id: accountId, centerY };
		}
		hoverIntent.enter(accountId);
	}
}
function position() {
	if (!window || window.isDestroyed()) return;
	const prefs = preferences();
	const display =
		state.surface === "edge"
			? (screen.getAllDisplays().find((d) => d.id === prefs.displayId) ??
				screen.getPrimaryDisplay())
			: screen.getDisplayMatching(anchor);
	const bounds = panelBounds(
		display.workArea,
		anchor,
		state.surface,
		state.expanded || edgeTransition.current !== null,
		edgeAccounts(state.accounts, prefs).length,
		edgeTransition.current !== null ? 548 : panelHeight,
		display.bounds,
	);
	if (state.surface === "edge" && edgeTransition.current !== null) {
		const collapsed = edgeHandleLayout(
			edgeAccounts(state.accounts, prefs).length,
			display.workArea,
		);
		bounds.width = Math.max(bounds.width, collapsed.width);
		bounds.height = Math.max(bounds.height, collapsed.height);
		bounds.x = display.bounds.x + display.bounds.width - bounds.width;
		bounds.y =
			display.workArea.y +
			Math.round((display.workArea.height - bounds.height) / 2);
	}
	window.setBounds(bounds);
}
export function showUsageWidget(
	bounds?: Electron.Rectangle,
	provider: WidgetProvider | null = null,
) {
	if (!running) return;
	hoverIntent.close();
	if (bounds) anchor = bounds;
	else {
		const p = screen.getCursorScreenPoint();
		anchor = { ...p, width: 1, height: 1 };
	}
	const animate =
		!bounds &&
		state.surface === "edge" &&
		!state.expanded &&
		window?.isVisible();
	if (animate) edgeTransition.begin();
	else edgeTransition.cancel();
	state = {
		...state,
		expanded: true,
		surface: bounds ? "menu" : preferences().edge ? "edge" : "menu",
		provider,
	};
	const panel = createPanel();
	windowRecovery?.retry();
	position();
	panel.show();
	panel.focus();
	publish();
	void refreshUsageWidget();
}
function closePanel() {
	hoverIntent.close();
	if (preferences().edge) {
		if (state.surface === "edge" && state.expanded && window?.isVisible())
			edgeTransition.begin();
		else if (state.surface !== "edge") edgeTransition.cancel();
		state = { ...state, surface: "edge", expanded: false, provider: null };
		position();
		window?.showInactive();
		publish();
	} else {
		edgeTransition.cancel();
		state.expanded = false;
		window?.hide();
		publish();
	}
}
function configureEdge() {
	hoverIntent.close();
	if (preferences().edge) {
		createPanel();
		closePanel();
	} else if (state.surface === "edge") {
		edgeTransition.cancel();
		window?.hide();
	}
	position();
}
function updateProviderTrays() {
	const prefs = preferences();
	const desired =
		prefs.menuBar === "providers"
			? new Set(
					prefs.providers.filter(
						(provider) =>
							!prefs.hiddenAccountIds.includes(
								selectedAccount(state.accounts, provider, prefs)?.id ?? "",
							),
					),
				)
			: new Set<WidgetProvider>();
	for (const [provider, tray] of providerTrays)
		if (!desired.has(provider)) {
			tray.destroy();
			providerTrays.delete(provider);
		}
	for (const provider of desired) {
		let tray = providerTrays.get(provider);
		if (!tray) {
			const icon = providerTrayIcon(provider);
			if (icon.isEmpty()) continue;
			tray = new Tray(icon);
			providerTrays.set(provider, tray);
			const current = tray;
			tray.on("click", () => showUsageWidget(current.getBounds(), provider));
		}
		const account = selectedAccount(state.accounts, provider, prefs);
		tray.setImage(
			providerTrayIcon(
				provider,
				account?.color,
				nativeTheme.shouldUseDarkColors,
			),
		);
		const quota = account ? preferredWindow(account, prefs.window) : undefined;
		const valid =
			account && quota && isCurrentWindow(account, quota, state.offline);
		const percent = valid
			? `${formatNumber(metricValue(quota, prefs.metric))}%`
			: "—";
		tray.setTitle(percent, { fontType: "monospacedDigit" });
		const label = account
			? prefs.hideEmails
				? account.label.replace(/\S+@\S+/g, PROVIDER_NAMES[provider])
				: account.label
			: i18n._(msg({ message: "Choose an account" }));
		tray.setToolTip(
			`${PROVIDER_NAMES[provider]} · ${label}\n${quota?.label ?? i18n._(msg({ message: "Usage unavailable" }))} · ${percent} ${prefs.metric === "remaining" ? i18n._(msg({ message: "remaining" })) : i18n._(msg({ message: "used" }))}`,
		);
	}
}
function reset() {
	hoverIntent.close();
	revision++;
	state = {
		...state,
		accounts: [],
		hostId: null,
		loading: false,
		offline: true,
	};
	publish();
	if (displayEnabled()) void refreshUsageWidget();
}
export function refreshUsageWidgetDisplay() {
	publish();
}
function wake() {
	restoreEdge();
	publish();
	if (displayEnabled()) void refreshUsageWidget();
}
function resizePanel(event: Electron.IpcMainEvent, height: unknown) {
	if (
		event.sender !== window?.webContents ||
		event.senderFrame !== window?.webContents.mainFrame ||
		!state.expanded ||
		typeof height !== "number" ||
		!Number.isFinite(height)
	)
		return;
	const next = Math.max(160, Math.min(548, Math.ceil(height)));
	if (next !== panelHeight) {
		panelHeight = next;
		if (state.surface === "edge") edgeTransition.begin();
		position();
		publish();
	}
}
function settleEdge(event: Electron.IpcMainEvent, transition: unknown) {
	if (
		event.sender !== window?.webContents ||
		event.senderFrame !== window?.webContents.mainFrame
	)
		return;
	edgeTransition.complete(transition);
}
function mainFocused(_event: Electron.Event, target: BrowserWindow) {
	if (getOrg(target.id)) wake();
}
function restoreEdge() {
	if (!running || !preferences().edge || state.surface !== "edge") return;
	const panel = createPanel();
	position();
	panel.showInactive();
}
function displayChanged() {
	hoverIntent.close();
	position();
	restoreEdge();
	publish();
}
function openSettings(accounts: boolean | "usage") {
	window?.hide();
	const target =
		getAllWindows().find((w) => getOrg(w.id) === state.hostId) ??
		getFocusedOrLastWindow();
	if (target) {
		if (target.isMinimized()) target.restore();
		target.show();
		target.focus();
		target.webContents.send(
			"deep-link-navigate",
			accounts === "usage"
				? "/settings/usage"
				: accounts
					? "/settings/usage"
					: "/settings/appearance",
		);
	} else focusMainWindow();
	if (preferences().edge) closePanel();
}
function acceptUsageObservation(observation: HostUsageObservation) {
	const hostId = state.hostId;
	const connection = hostId
		? getHostServiceCoordinator().getConnection(hostId)
		: null;
	if (
		!connection ||
		!hostId ||
		observation.hostUrl !== `http://127.0.0.1:${connection.port}`
	)
		return;
	const data = observation.data;
	state.accounts = data
		? projectWidgetAccounts(
				data,
				appearanceStore.readWidgetAppearances(hostId),
				observation.offline,
			)
		: [];
	state.offline = observation.offline;
	state.inventoryUnavailable =
		!observation.loading &&
		(!data || data.some((account) => account.discoveryFailed));
	state.loading = observation.loading;
	publish();
}
let unsubscribeUsage: (() => void) | undefined;
export function initUsageWidget(onPreferenceChange: () => void) {
	if (running || process.platform !== "darwin") return;
	unsubscribeUsage = hostUsageObservations.subscribe(acceptUsageObservation);
	running = true;
	updateLogo = onPreferenceChange;
	ipcMain.on("usage-widget:resize", resizePanel);
	ipcMain.on("usage-widget:settled", settleEdge);
	ipcMain.on("usage-widget:hover", hoverUsage);
	ipcMain.handle("usage-widget:snapshot", (event) => {
		if (
			(event.sender !== window?.webContents &&
				event.sender !== hoverWindow?.webContents &&
				!resetCelebrationFor(event.sender)) ||
			event.senderFrame !== event.sender.mainFrame
		)
			throw new Error("Invalid usage window");
		return {
			...usageWidgetSnapshot(),
			celebration: resetCelebrationFor(event.sender),
			preview:
				event.sender === hoverWindow?.webContents ? hoverIntent.current : null,
		};
	});
	ipcMain.handle(
		"usage-widget:visibility",
		async (event, id: unknown, hidden: unknown) => {
			if (
				event.sender !== window?.webContents ||
				event.senderFrame !== window?.webContents.mainFrame ||
				typeof hidden !== "boolean" ||
				!(typeof id === "string" || (id === null && hidden === false))
			)
				throw new Error("Invalid usage window");
			await setUsageWidgetAccountHidden(id, hidden);
		},
	);
	ipcMain.handle(
		"usage-widget:appearance",
		(event, accountId: unknown, patch: unknown) => {
			if (
				event.sender !== window?.webContents ||
				event.senderFrame !== window?.webContents.mainFrame ||
				typeof accountId !== "string"
			)
				throw new Error("Invalid usage window");
			return saveUsageWidgetAppearance(accountId, patch);
		},
	);
	ipcMain.handle("usage-widget:action", async (event, action: unknown) => {
		if (
			event.sender !== window?.webContents ||
			event.senderFrame !== window?.webContents.mainFrame
		)
			throw new Error("Invalid usage window");
		switch (action) {
			case "refresh":
				await refreshUsageWidget(true);
				break;
			case "usage":
				openSettings("usage");
				break;
			case "accounts":
				openSettings(true);
				break;
			case "settings":
				openSettings(false);
				break;
			case "expand":
				showUsageWidget();
				break;
			case "collapse":
			case "close":
				closePanel();
				break;
			default:
				throw new Error("Invalid usage action");
		}
	});
	getHostServiceCoordinator().on("status-changed", wake);
	authEvents.on("token-cleared", reset);
	authEvents.on("token-saved", reset);
	app.on("browser-window-focus", mainFocused);
	powerMonitor.on("resume", wake);
	powerMonitor.on("unlock-screen", wake);
	nativeTheme.on("updated", publish);
	screen.on("display-removed", displayChanged);
	screen.on("display-metrics-changed", displayChanged);
	screen.on("display-added", displayChanged);
	timer = setInterval(() => {
		publish();
		if (displayEnabled()) void refreshUsageWidget();
	}, 60_000);
	configureEdge();
	if (displayEnabled()) void refreshUsageWidget();
}
export function disposeUsageWidget() {
	unsubscribeUsage?.();
	unsubscribeUsage = undefined;
	closeResetCelebration();
	running = false;
	revision++;
	if (timer) clearInterval(timer);
	timer = undefined;
	getHostServiceCoordinator().off("status-changed", wake);
	authEvents.off("token-cleared", reset);
	authEvents.off("token-saved", reset);
	app.off("browser-window-focus", mainFocused);
	powerMonitor.off("resume", wake);
	powerMonitor.off("unlock-screen", wake);
	nativeTheme.off("updated", publish);
	screen.off("display-removed", displayChanged);
	screen.off("display-metrics-changed", displayChanged);
	screen.off("display-added", displayChanged);
	edgeTransition.cancel();
	windowRecovery?.dispose();
	hoverRecovery?.dispose();
	ipcMain.removeListener("usage-widget:resize", resizePanel);
	ipcMain.removeListener("usage-widget:settled", settleEdge);
	ipcMain.removeListener("usage-widget:hover", hoverUsage);
	ipcMain.removeHandler("usage-widget:snapshot");
	ipcMain.removeHandler("usage-widget:action");
	ipcMain.removeHandler("usage-widget:visibility");
	ipcMain.removeHandler("usage-widget:appearance");
	snapshotListeners.clear();
	publishedMetadata = null;
	window?.destroy();
	window = null;
	hoverIntent.close();
	hoverWindow?.destroy();
	hoverWindow = null;
	for (const tray of providerTrays.values()) tray.destroy();
	providerTrays.clear();
}

export function previewUsageReset(kind: "session" | "weekly") {
	if (!running) return;
	closeResetCelebration();
	showResetCelebration(
		{ kind, label: i18n._(msg({ message: "Preview" })) },
		preferences().displayId,
	);
}
