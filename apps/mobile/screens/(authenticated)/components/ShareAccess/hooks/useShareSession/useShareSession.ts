import { type ShareResourceKind, shareUiEvent } from "@superset/shared/sharing";
import { useEffect } from "react";
import { posthog } from "@/lib/posthog";

// The share sheet stays mounted under the invite screen, where sharing
// happens, so the two meet here. Only one share sheet is open at a time.
let shared = false;

/** Called by a successful share, so the sheet's close reports it. */
export function markShared(): void {
	shared = true;
}

/** Reports the share sheet opening, and closing with whether anything was shared. */
export function useShareSession(resourceKind: ShareResourceKind): void {
	useEffect(() => {
		shared = false;
		posthog.capture(...shareUiEvent({ type: "opened" }, resourceKind));
		return () => {
			posthog.capture(
				...shareUiEvent({ type: "closed", shared }, resourceKind),
			);
		};
	}, [resourceKind]);
}
