import { createContext, type ReactNode, useContext } from "react";
import type { ActionKeySlot } from "../../utils/assignActionKeys";

const ActionKeysContext = createContext<Record<string, ActionKeySlot>>({});

interface ActionKeysProviderProps {
	/** The key each action answers to, by action id. Empty while the block does not have focus. */
	slots: Record<string, ActionKeySlot>;
	children: ReactNode;
}

/** A block's actions answer to keys only while the block has focus; its buttons read their key from here. */
export function ActionKeysProvider({
	slots,
	children,
}: ActionKeysProviderProps) {
	return (
		<ActionKeysContext.Provider value={slots}>
			{children}
		</ActionKeysContext.Provider>
	);
}

/** The key an action's button answers to, if its block has focus. */
export function useActionKey(
	actionId: string | undefined,
): ActionKeySlot | undefined {
	const slots = useContext(ActionKeysContext);
	return actionId ? slots[actionId] : undefined;
}

/** Every key of the focused block, for a row that draws several actions. */
export function useActionKeys(): Record<string, ActionKeySlot> {
	return useContext(ActionKeysContext);
}
