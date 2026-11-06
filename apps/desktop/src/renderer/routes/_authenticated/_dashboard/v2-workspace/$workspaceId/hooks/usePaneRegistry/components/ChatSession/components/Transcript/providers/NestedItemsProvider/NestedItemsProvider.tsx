import type { SessionSnapshot } from "@superset/chat/core";
import type { Decision, Item } from "@superset/chat/protocol";
import { createContext, useContext } from "react";

export type NestedItemsContextValue = {
	snapshot: SessionSnapshot;
	childrenByParent: ReadonlyMap<string, readonly Item[]>;
	requestItemBodies: (itemIds: readonly string[]) => void;
	respondToApproval: (approvalId: string, decision: Decision) => void;
	openSubagent: (itemId: string) => void;
	moveToBackground?: ((itemId: string) => void) | undefined;
};

const NestedItemsContext = createContext<NestedItemsContextValue | null>(null);

export const NestedItemsProvider = NestedItemsContext.Provider;

export function useNestedItems(): NestedItemsContextValue {
	const value = useContext(NestedItemsContext);
	if (!value) throw new Error("useNestedItems outside the transcript");
	return value;
}
