import type { TerminalColors } from "@superset/shared/terminal-colors";
import { useEffect, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getDefaultTerminalAppearance } from "renderer/lib/terminal/appearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useTerminalTheme, useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";

const fallbackTheme = getDefaultTerminalAppearance().theme;

const pushChains = new Map<string, Promise<void>>();

function pushTerminalTheme(
	hostUrl: string,
	theme: { themeType: "dark" | "light"; colors: TerminalColors },
): void {
	const push = (pushChains.get(hostUrl) ?? Promise.resolve())
		.then(() =>
			getHostServiceClientByUrl(hostUrl).settings.terminalTheme.set.mutate(
				theme,
			),
		)
		.then(
			() => {},
			(error) => {
				console.warn(
					"[HostTerminalThemeSync] Failed to push terminal theme to host:",
					error,
				);
			},
		);
	pushChains.set(hostUrl, push);
}

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
		pushTerminalTheme(activeHostUrl, { themeType, colors });
	}, [activeHostUrl, themeType, colors]);

	return null;
}
