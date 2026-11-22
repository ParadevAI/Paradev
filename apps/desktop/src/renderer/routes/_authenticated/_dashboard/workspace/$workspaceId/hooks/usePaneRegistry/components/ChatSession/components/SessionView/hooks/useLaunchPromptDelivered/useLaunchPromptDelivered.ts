import type { StoredItem } from "@superset/chat/core";
import { useEffect, useMemo } from "react";
import { hasUserMessage } from "../../../../utils/hasUserMessage";

export function useLaunchPromptDelivered(
	items: ReadonlyMap<string, StoredItem>,
	onDelivered: (() => void) | undefined,
) {
	const delivered = useMemo(() => hasUserMessage(items), [items]);
	useEffect(() => {
		if (delivered) onDelivered?.();
	}, [delivered, onDelivered]);
}
