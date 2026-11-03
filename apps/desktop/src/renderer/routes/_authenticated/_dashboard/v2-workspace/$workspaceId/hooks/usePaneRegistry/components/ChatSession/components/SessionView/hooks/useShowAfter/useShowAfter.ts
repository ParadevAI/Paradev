import { useEffect, useState } from "react";

export function useShowAfter(active: boolean, delayMs: number): boolean {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (!active) {
			setShown(false);
			return;
		}
		const timer = setTimeout(() => setShown(true), delayMs);
		return () => clearTimeout(timer);
	}, [active, delayMs]);
	return active && (shown || delayMs <= 0);
}
