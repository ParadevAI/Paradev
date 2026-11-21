import type { MouseEvent, ReactNode } from "react";

function stop(event: MouseEvent) {
	event.stopPropagation();
}

/**
 * React events from portalled menus and dialogs still bubble to the pane
 * header, which pins the pane on click and closes it on middle-click.
 */
export function StopHeaderEvents({ children }: { children: ReactNode }) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: only stops propagation
		// biome-ignore lint/a11y/useKeyWithClickEvents: only stops propagation
		<div className="contents" onClick={stop} onAuxClick={stop}>
			{children}
		</div>
	);
}
