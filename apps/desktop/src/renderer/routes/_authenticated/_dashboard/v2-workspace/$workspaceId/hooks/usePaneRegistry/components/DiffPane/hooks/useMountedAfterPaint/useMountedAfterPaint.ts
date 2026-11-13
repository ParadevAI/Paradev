import { startTransition, useEffect, useState } from "react";

const FALLBACK_MS = 100;

/** False on the first commit, true once the browser has painted it.
 *  rAF does not fire in a background window, so a timer is the fallback. */
export function useMountedAfterPaint(): boolean {
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		const mount = () => startTransition(() => setMounted(true));
		const frame = requestAnimationFrame(mount);
		const timer = setTimeout(mount, FALLBACK_MS);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	}, []);
	return mounted;
}
