import { cn } from "@superset/ui/utils";
import { type ReactNode, useCallback, useState } from "react";

export function AnimatedHeight({ children }: { children: ReactNode }) {
	const [height, setHeight] = useState<number>();
	const attach = useCallback((node: HTMLDivElement) => {
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setHeight(entry.borderBoxSize[0]?.blockSize);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<div
			className={cn(
				"shrink-0 overflow-clip",
				height !== undefined &&
					"transition-[height] duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
			)}
			style={{ height }}
		>
			<div ref={attach}>{children}</div>
		</div>
	);
}
