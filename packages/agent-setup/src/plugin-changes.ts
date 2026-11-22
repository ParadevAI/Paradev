let tail: Promise<unknown> = Promise.resolve();

/**
 * Runs plugin changes in this process one at a time. Each one reads
 * installed_plugins.json, then rewrites it and the agent configs, so two that
 * overlap would each write a ledger missing the other's change.
 */
export function serializePluginChange<T>(change: () => Promise<T>): Promise<T> {
	const next = tail.then(change);
	tail = next.catch(() => undefined);
	return next;
}
