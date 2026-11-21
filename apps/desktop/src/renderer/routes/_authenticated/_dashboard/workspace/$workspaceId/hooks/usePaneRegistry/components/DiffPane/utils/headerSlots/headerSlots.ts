export function diffPaneTitleSlotId(paneId: string): string {
	return `diff-pane-title-${paneId}`;
}

export function diffPaneActionsSlotId(paneId: string): string {
	return `diff-pane-actions-${paneId}`;
}

// The header and the pane body mount in either order (and the header gains
// its slots when the right pane area turns on), so slots announce themselves.
const slots = new Map<string, HTMLElement>();
const listeners = new Set<() => void>();

export function setHeaderSlot(id: string, element: HTMLElement | null): void {
	if (element) slots.set(id, element);
	else slots.delete(id);
	for (const listener of listeners) listener();
}

export function getHeaderSlot(id: string): HTMLElement | null {
	return slots.get(id) ?? null;
}

export function subscribeHeaderSlots(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
