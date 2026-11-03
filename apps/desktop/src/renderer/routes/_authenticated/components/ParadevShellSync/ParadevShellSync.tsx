import { useLayoutEffect } from "react";
import { useParadevShell } from "renderer/hooks/useParadevShell";

/** Puts `data-shell="next"` on <html>, which the `shell-next:` Tailwind variant keys on. */
export function ParadevShellSync() {
	const isParadevShell = useParadevShell();

	useLayoutEffect(() => {
		const root = document.documentElement;
		if (isParadevShell) root.dataset.shell = "next";
		else delete root.dataset.shell;
	}, [isParadevShell]);

	return null;
}
