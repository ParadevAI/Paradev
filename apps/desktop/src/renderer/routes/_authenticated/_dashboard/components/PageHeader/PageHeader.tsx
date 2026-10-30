import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
	start?: ReactNode;
	end?: ReactNode;
	/** The row itself: borders, position, background. */
	className?: string;
	/** The padded area: padding and gaps. */
	contentClassName?: string;
	/** A row that lays out its own drag area, in place of `start` and `end`. */
	children?: ReactNode;
}

/** Every screen's header row. The space between `start` and `end` drags the window. */
export function PageHeader({
	start,
	end,
	className,
	contentClassName,
	children,
}: PageHeaderProps) {
	return (
		<header className={cn("flex h-12 shrink-0 items-center", className)}>
			<div
				className={cn(
					"flex h-full min-w-0 flex-1 items-center gap-2 px-4",
					contentClassName,
				)}
			>
				{children ?? (
					<>
						{start}
						<div className="drag h-full min-w-0 flex-1" />
						{end}
					</>
				)}
			</div>
		</header>
	);
}
