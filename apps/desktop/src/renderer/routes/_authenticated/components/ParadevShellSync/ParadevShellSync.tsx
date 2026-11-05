import { useLayoutEffect } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useParadevShell } from "renderer/hooks/useParadevShell";

/** Puts `data-shell="next"` on <html>, which the `shell-next:` Tailwind variant keys on. */
export function ParadevShellSync() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isParadevShell = useParadevShell() && isV2CloudEnabled;

	useLayoutEffect(() => {
		const root = document.documentElement;
		if (isParadevShell) root.dataset.shell = "next";
		else delete root.dataset.shell;
	}, [isParadevShell]);

	return null;
}
