import type { SessionSnapshot } from "@superset/chat/core";
import { deriveChildrenByParent } from "@superset/chat/core";
import type { Item } from "@superset/chat/protocol";
import { useMemo, useRef } from "react";

export function useChildrenByParent(
	snapshot: SessionSnapshot,
): ReadonlyMap<string, readonly Item[]> {
	const previousRef = useRef<ReadonlyMap<string, readonly Item[]>>(new Map());
	const { items } = snapshot;
	return useMemo(() => {
		const next = deriveChildrenByParent({ items }, previousRef.current);
		previousRef.current = next;
		return next;
	}, [items]);
}
