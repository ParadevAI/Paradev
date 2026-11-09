import type { ShareResourceKind } from "@superset/shared/sharing";
import { useEffect, useRef } from "react";
import {
	captureShareEvent,
	resetShareSession,
	sharedInSession,
} from "../../utils/shareSession";

/**
 * Reports the share sheet opening and closing: whether anything was shared in
 * between, and whether this person could share at all.
 */
export function useShareSession(
	resourceKind: ShareResourceKind,
	canManage: boolean,
): void {
	// Read at close: it can still be loading when the sheet opens.
	const canManageRef = useRef(canManage);
	canManageRef.current = canManage;

	useEffect(() => {
		resetShareSession();
		captureShareEvent({ type: "opened" }, resourceKind);
		return () => {
			captureShareEvent(
				{
					type: "closed",
					shared: sharedInSession(),
					canManage: canManageRef.current,
				},
				resourceKind,
			);
		};
	}, [resourceKind]);
}
