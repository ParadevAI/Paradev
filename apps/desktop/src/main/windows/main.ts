import { join } from "node:path";
import { BrowserWindow, screen } from "electron";

import { createWindow } from "lib/electron-app/factories/windows/create";
import { ENVIRONMENT } from "shared/constants";
import { displayName } from "~/package.json";
import { createApplicationMenu } from "../lib/menu";
import { registerTerminalIPCs } from "../lib/terminal-ipcs";
import { registerWorkspaceIPCs } from "../lib/workspace-ipcs";
import { registerPortIpcs } from "../lib/port-ipcs";

export async function MainWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const window = createWindow({
		id: "main",
		title: displayName,
		width,
		height,
		show: false,
		center: true,
		movable: true,
		resizable: true,
		alwaysOnTop: false,
		autoHideMenuBar: true,
		frame: false,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 16, y: 16 },

		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
		},
	});

	// Register IPC handlers
	const cleanupTerminal = registerTerminalIPCs(window);
	registerWorkspaceIPCs();
	registerPortIpcs();

	// Create application menu
	createApplicationMenu(window);

	window.webContents.on("did-finish-load", () => {
		window.show();
	});

	window.on("close", () => {
		// Clean up terminal processes
		cleanupTerminal();

		for (const window of BrowserWindow.getAllWindows()) {
			window.destroy();
		}
	});

	return window;
}
