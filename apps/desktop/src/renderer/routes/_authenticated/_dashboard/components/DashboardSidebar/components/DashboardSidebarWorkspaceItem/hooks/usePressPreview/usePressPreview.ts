import { useCallback, useEffect, useMemo, useRef } from "react";
import { keptWorkspacesStore } from "renderer/routes/_authenticated/_dashboard/stores/keptWorkspacesStore";
import { setPressedWorkspaceId } from "renderer/routes/_authenticated/_dashboard/stores/pressedWorkspaceStore";

const DRAG_SLOP_PX = 4;

/** Shows the workspace while the pointer is down on its row; the click
 *  navigates. A drag, or a release without a click, shows the active one. */
export function usePressPreview(workspaceId: string) {
	const cleanupRef = useRef<(() => void) | null>(null);

	const end = useCallback(() => {
		cleanupRef.current?.();
		cleanupRef.current = null;
	}, []);

	const cancel = useCallback(() => {
		end();
		setPressedWorkspaceId(null);
		keptWorkspacesStore.showActive();
	}, [end]);

	const start = useCallback(
		(x: number, y: number) => {
			end();
			setPressedWorkspaceId(workspaceId);
			keptWorkspacesStore.showNow(workspaceId);
			let releaseTimer: ReturnType<typeof setTimeout> | undefined;
			const onMove = (event: PointerEvent) => {
				if (Math.hypot(event.clientX - x, event.clientY - y) > DRAG_SLOP_PX) {
					cancel();
				}
			};
			// The click, when there is one, comes in the same task as the
			// release, so a timer that still runs means there was none.
			const onUp = () => {
				releaseTimer = setTimeout(cancel, 0);
			};
			window.addEventListener("pointermove", onMove, true);
			window.addEventListener("pointerup", onUp, true);
			window.addEventListener("blur", cancel);
			cleanupRef.current = () => {
				clearTimeout(releaseTimer);
				window.removeEventListener("pointermove", onMove, true);
				window.removeEventListener("pointerup", onUp, true);
				window.removeEventListener("blur", cancel);
			};
		},
		[workspaceId, end, cancel],
	);

	useEffect(() => end, [end]);

	return useMemo(() => ({ start, commit: end }), [start, end]);
}
