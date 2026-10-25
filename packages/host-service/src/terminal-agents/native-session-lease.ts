/** In-process ownership across terminal and chat launch paths. Native process
 * registries/locks remain necessary for other apps and other host processes. */
const owners = new Map<string, symbol>();
export function claimNativeSession(
	provider: string,
	sessionId: string,
): () => void {
	const key = JSON.stringify([provider, sessionId]);
	if (owners.has(key))
		throw new Error(
			"This conversation is already opening or running in this host. Open its existing chat instead.",
		);
	const owner = Symbol();
	owners.set(key, owner);
	return () => {
		if (owners.get(key) === owner) owners.delete(key);
	};
}
