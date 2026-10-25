import { join } from "node:path";
import { app, BrowserWindow, screen } from "electron";
import { env } from "shared/env.shared";
import type { WidgetSnapshot } from "shared/usage-widget/model";

let overlay: BrowserWindow | null = null;
let current: WidgetSnapshot["celebration"] = null;
let timer: ReturnType<typeof setTimeout> | undefined;
export const resetCelebrationActive = () => overlay !== null;
export const resetCelebrationFor = (sender: Electron.WebContents) =>
	overlay?.webContents === sender ? current : null;
export function closeResetCelebration() {
	if (timer) clearTimeout(timer);
	timer = undefined;
	overlay?.destroy();
	overlay = null;
	current = null;
}
export function showResetCelebration(
	value: NonNullable<WidgetSnapshot["celebration"]>,
	displayId: number | null,
) {
	if (overlay) return;
	const display =
		screen.getAllDisplays().find((d) => d.id === displayId) ??
		screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	const panel = new BrowserWindow({
		title: `${app.name} — Usage renewed`,
		type: "panel",
		...display.bounds,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		focusable: false,
		skipTaskbar: true,
		hiddenInMissionControl: true,
		resizable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		hasShadow: false,
		roundedCorners: false,
		webPreferences: {
			preload: join(__dirname, "../preload/usage-widget.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			partition: "usage-widget",
		},
	});
	overlay = panel;
	current = value;
	const close = () => {
		if (overlay === panel) closeResetCelebration();
	};
	panel.setIgnoreMouseEvents(true);
	panel.setAlwaysOnTop(true, "pop-up-menu");
	panel.setVisibleOnAllWorkspaces(true, {
		visibleOnFullScreen: true,
		skipTransformProcessType: process.platform === "darwin",
	});
	panel.webContents.on("render-process-gone", close);
	panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	panel.webContents.on("will-navigate", (event) => event.preventDefault());
	panel.on("page-title-updated", (event) => event.preventDefault());
	panel.on("closed", () => {
		if (overlay === panel) {
			overlay = null;
			current = null;
		}
	});
	panel.once("ready-to-show", () => {
		if (!panel.isDestroyed()) panel.showInactive();
	});
	timer = setTimeout(close, 6500);
	const loading = app.isPackaged
		? panel.loadFile(join(__dirname, "../renderer/usage-widget.html"))
		: panel.loadURL(
				`http://localhost:${env.DESKTOP_VITE_PORT}/usage-widget.html`,
			);
	void loading.catch(close);
}
