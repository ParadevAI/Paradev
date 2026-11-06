import type { TerminalColors } from "@superset/shared/terminal-colors";
import { useEffect, useMemo } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getDefaultTerminalAppearance } from "renderer/lib/terminal/appearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useTerminalTheme, useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";
import { connectedHostUrls } from "./utils/connectedHostUrls";
import { createHostThemePusher } from "./utils/createHostThemePusher";

const fallbackTheme = getDefaultTerminalAppearance().theme;

const pusher = createHostThemePusher({
	send: (
		hostUrl: string,
		theme: { themeType: "dark" | "light"; colors: TerminalColors },
	) =>
		getHostServiceClientByUrl(hostUrl).settings.terminalTheme.set.mutate(theme),
	onError: (hostUrl, error) => {
		console.warn(
			`[HostTerminalThemeSync] Failed to push terminal theme to ${hostUrl}:`,
			error,
		);
	},
});

export function HostTerminalThemeSync() {
	const { activeHostUrl, machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const { hosts } = useKnownHosts();
	const activeTheme = useTheme();
	const terminalTheme = useTerminalTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	const theme = useMemo(
		() => ({
			themeType,
			colors: terminalQueryColors(terminalTheme ?? fallbackTheme),
		}),
		[themeType, terminalTheme],
	);
	const hostUrls = useMemo(
		() => connectedHostUrls({ activeHostUrl, machineId, relayUrl, hosts }),
		[activeHostUrl, machineId, relayUrl, hosts],
	);

	useEffect(() => {
		void pusher.sync(hostUrls, theme);
	}, [hostUrls, theme]);

	return null;
}
