import { type RefObject, useEffect, useState } from "react";

export function usePaneThird(
	paneRef: RefObject<HTMLElement | null> | undefined,
) {
	const [third, setThird] = useState<number | null>(null);
	useEffect(() => {
		const pane = paneRef?.current;
		if (!pane) return;
		const sync = () => setThird(Math.floor(pane.clientHeight / 3) || null);
		sync();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(sync);
		observer.observe(pane);
		return () => observer.disconnect();
	}, [paneRef]);
	return third;
}
