import { canTrack, markTrackerLoaded } from "./consent";

export function createPosthogStarter<T>(
	load: () => Promise<T>,
	init: (posthog: T) => void,
): () => Promise<void> {
	let started = false;
	return async () => {
		if (started || !canTrack()) return;
		started = true;
		const posthog = await load();
		if (!canTrack()) {
			started = false;
			return;
		}
		init(posthog);
		markTrackerLoaded();
	};
}
