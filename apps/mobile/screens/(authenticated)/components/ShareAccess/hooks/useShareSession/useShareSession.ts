import type { ShareResourceKind } from "@superset/shared/sharing";
import { useEffect } from "react";
import {
	captureShareEvent,
	resetShareSession,
	sharedInSession,
} from "../../utils/shareSession";

/** Reports the share sheet opening and closing, and whether anything was shared in between. */
export function useShareSession(resourceKind: ShareResourceKind): void {
	useEffect(() => {
		resetShareSession();
		captureShareEvent({ type: "opened" }, resourceKind);
		return () => {
			captureShareEvent(
				{ type: "closed", shared: sharedInSession() },
				resourceKind,
			);
		};
	}, [resourceKind]);
}
