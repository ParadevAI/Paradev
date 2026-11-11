import type { Options } from "react-hotkeys-hook";

export function resolveHotkeyEnabled(
	callerEnabled: Options["enabled"],
	isScreenActive: boolean,
): Options["enabled"] {
	if (!isScreenActive) return false;
	return callerEnabled ?? true;
}
