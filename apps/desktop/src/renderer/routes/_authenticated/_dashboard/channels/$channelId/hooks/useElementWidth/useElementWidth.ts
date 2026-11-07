import { useEffect, useState } from "react";

export function useElementWidth(element: HTMLElement | null): number | null {
	const [width, setWidth] = useState<number | null>(null);
	useEffect(() => {
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	return width;
}
