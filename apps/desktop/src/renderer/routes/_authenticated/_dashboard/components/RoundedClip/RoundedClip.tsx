import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

/**
 * Clips to rounded corners, with an optional square left edge.
 * Chromium masks every composited child of a clip whose corner radii differ, so the radius stays uniform and the left corners sit outside the visible box.
 */
export function RoundedClip({
	squareLeft,
	radiusClassName,
	className,
	children,
}: {
	squareLeft: boolean;
	radiusClassName: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
				radiusClassName,
				squareLeft && "pointer-events-none -ml-[10px] pl-[10px]",
			)}
		>
			<div
				className={cn(
					"pointer-events-auto relative flex min-h-0 min-w-0 flex-1",
					className,
				)}
			>
				{children}
			</div>
		</div>
	);
}
