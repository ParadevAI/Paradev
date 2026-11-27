import {
	type DesktopWindow,
	parseDesktopWindowRoute,
} from "@superset/shared/desktop-windows";
import {
	getAllWindows,
	getFocusedOrLastWindow,
} from "../window-registry/window-registry";

export function listDesktopWindows(): DesktopWindow[] {
	const lastFocused = getFocusedOrLastWindow();
	return getAllWindows().map((window) => ({
		id: window.id,
		focused: window.isFocused(),
		lastFocused: window === lastFocused,
		visible: window.isVisible() && !window.isMinimized(),
		...parseDesktopWindowRoute(window.webContents.getURL()),
	}));
}
