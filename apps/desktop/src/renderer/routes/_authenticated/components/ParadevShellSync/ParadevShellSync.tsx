import { useEffect, useLayoutEffect } from "react";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useResolvedTheme } from "renderer/stores/theme";
import { toHex } from "shared/themes/utils";

/** Matches the title bar row, which the Windows and Linux window controls sit in. */
const TITLE_BAR_HEIGHT = 44;

/**
 * Puts `data-shell="next"` on <html> for the `shell-next:` Tailwind variant,
 * and paints the Windows/Linux window controls in the shell's title bar colour.
 */
export function ParadevShellSync() {
	const isParadevShell = useParadevShell();
	const theme = useResolvedTheme();

	useLayoutEffect(() => {
		const root = document.documentElement;
		if (isParadevShell) root.dataset.shell = "next";
		else delete root.dataset.shell;
	}, [isParadevShell]);

	useEffect(() => {
		if (!isParadevShell) return;
		electronTrpcClient.window.setTitleBarOverlay
			.mutate({
				color: toHex(theme.ui.sidebar),
				symbolColor: toHex(theme.ui.foreground),
				height: TITLE_BAR_HEIGHT,
			})
			.catch(() => {});
	}, [isParadevShell, theme]);

	return null;
}
