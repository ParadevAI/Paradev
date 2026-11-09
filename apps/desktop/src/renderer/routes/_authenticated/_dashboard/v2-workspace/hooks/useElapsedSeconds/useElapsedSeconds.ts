import { useEffect, useState } from "react";

/**
 * A warm sandbox is up in a second or two; the first ones after an image
 * rebuild pull the image and take tens of seconds. Past this, it is more
 * likely stuck than slow.
 */
export const CLOUD_START_STUCK_AFTER_SECONDS = 45;

export function useElapsedSeconds(since: number): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(id);
	}, []);
	return (now - since) / 1000;
}

export function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(total / 60);
	return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}
