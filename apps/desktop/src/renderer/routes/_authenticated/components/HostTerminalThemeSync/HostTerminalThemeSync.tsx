import { useEffect, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getDefaultTerminalAppearance } from "renderer/lib/terminal/appearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useTerminalTheme, useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";

const fallbackTheme = getDefaultTerminalAppearance().theme;

/**
 * Pushes the resolved terminal theme to the local host-service so terminals
 * it creates without one (CLI, automations, setup and teardown) match the
 * app. Re-pushed on every appearance change and host (re)connect; an older
 * host without the procedure keeps its dark default.
 */
export function HostTerminalThemeSync() {
	const { activeHostUrl } = useLocalHostService();
	const activeTheme = useTheme();
	const terminalTheme = useTerminalTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	const colors = useMemo(
		() => terminalQueryColors(terminalTheme ?? fallbackTheme),
		[terminalTheme],
	);

	useEffect(() => {
		if (!activeHostUrl) return;
		getHostServiceClientByUrl(activeHostUrl)
			.settings.terminalTheme.set.mutate({ themeType, colors })
			.catch((error) => {
				console.warn(
					"[HostTerminalThemeSync] Failed to push terminal theme to host:",
					error,
				);
			});
	}, [activeHostUrl, themeType, colors]);

	return null;
}
