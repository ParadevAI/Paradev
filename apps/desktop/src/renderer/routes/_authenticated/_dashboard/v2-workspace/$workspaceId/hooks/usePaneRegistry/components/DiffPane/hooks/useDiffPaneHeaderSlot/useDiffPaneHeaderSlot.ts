import { useSyncExternalStore } from "react";
import { getHeaderSlot, subscribeHeaderSlots } from "../../utils/headerSlots";

/** The mounted header slot for this id, or null until it mounts. */
export function useDiffPaneHeaderSlot(id: string): HTMLElement | null {
	return useSyncExternalStore(subscribeHeaderSlots, () => getHeaderSlot(id));
}
