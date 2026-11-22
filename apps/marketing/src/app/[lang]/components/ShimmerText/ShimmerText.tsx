import type { ReactNode } from "react";

interface ShimmerTextProps {
	children: ReactNode;
	className?: string;
}

// The highlight is a brighter copy of the text inside a window that slides
// across it. Both layers move with transform only, so the sweep runs on the
// compositor and never repaints.
export function ShimmerText({ children, className = "" }: ShimmerTextProps) {
	return (
		<span className={`relative text-neutral-100/40 ${className}`}>
			{children}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_50%,transparent)] motion-safe:animate-shimmer-window motion-reduce:hidden"
			>
				<span className="block whitespace-nowrap text-neutral-100/90 motion-safe:animate-shimmer-text">
					{children}
				</span>
			</span>
		</span>
	);
}
