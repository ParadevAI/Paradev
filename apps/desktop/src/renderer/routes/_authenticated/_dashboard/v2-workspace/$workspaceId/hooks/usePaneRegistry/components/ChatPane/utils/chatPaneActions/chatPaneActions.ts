export type ChatPaneAction = "rename" | "export";

type ActionListener = (action: ChatPaneAction) => void;

const listeners = new Map<string, Set<ActionListener>>();

export function onChatPaneAction(
	paneId: string,
	listener: ActionListener,
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

export function runChatPaneAction(
	paneId: string,
	action: ChatPaneAction,
): void {
	for (const listener of listeners.get(paneId) ?? []) listener(action);
}
