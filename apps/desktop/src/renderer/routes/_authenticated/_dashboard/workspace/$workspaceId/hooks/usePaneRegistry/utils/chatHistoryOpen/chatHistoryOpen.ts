type OpenListener = () => void;

const listeners = new Map<string, Set<OpenListener>>();

/**
 * The history picker sits in the pane header and the composer in the pane
 * body, so `/resume` reaches the picker through this registry, keyed by pane.
 */
export function onOpenChatHistory(
	paneId: string,
	listener: OpenListener,
): () => void {
	const registered = listeners.get(paneId);
	if (registered) {
		registered.add(listener);
	} else {
		listeners.set(paneId, new Set([listener]));
	}
	return () => {
		const current = listeners.get(paneId);
		if (!current) return;
		current.delete(listener);
		if (current.size === 0) listeners.delete(paneId);
	};
}

export function openChatHistory(paneId: string): void {
	for (const listener of listeners.get(paneId) ?? []) listener();
}
