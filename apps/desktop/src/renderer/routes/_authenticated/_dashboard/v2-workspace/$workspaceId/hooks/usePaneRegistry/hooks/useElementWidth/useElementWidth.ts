import { useLayoutEffect, useState } from "react";

export function useElementWidth(element: HTMLElement | null): number | null {
	const [width, setWidth] = useState<number | null>(null);
	useLayoutEffect(() => {
		if (!element) return;
		setWidth(element.getBoundingClientRect().width);
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	return width;
}
