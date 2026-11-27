export const DEEP_LINK_NAVIGATE_CHANNEL = "deep-link-navigate";
export const DEEP_LINK_READY_CHANNEL = "deep-link-ready";

interface DeepLinkTarget {
	id: number;
	send: (channel: string, route: string) => void;
}

/**
 * A message sent to a window that is still loading is lost, so a route is
 * held until that window's renderer says it is listening.
 */
export function createDeepLinkDelivery() {
	const listening = new Set<number>();
	const held = new Map<number, string>();

	return {
		deliver(target: DeepLinkTarget, route: string): void {
			if (listening.has(target.id)) {
				target.send(DEEP_LINK_NAVIGATE_CHANNEL, route);
				return;
			}
			held.set(target.id, route);
		},
		markListening(target: DeepLinkTarget): void {
			listening.add(target.id);
			const route = held.get(target.id);
			if (route === undefined) return;
			held.delete(target.id);
			target.send(DEEP_LINK_NAVIGATE_CHANNEL, route);
		},
		markLoading(id: number): void {
			listening.delete(id);
		},
		forget(id: number): void {
			listening.delete(id);
			held.delete(id);
		},
	};
}
