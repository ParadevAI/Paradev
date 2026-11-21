import type { ReactNode } from "react";

interface ShimmerTextProps {
	children: ReactNode;
	className?: string;
}

export function ShimmerText({ children, className = "" }: ShimmerTextProps) {
	return (
		<span
			className={`bg-[linear-gradient(90deg,rgb(245_245_245/0.4)_0_42%,rgb(245_245_245/0.92)_60%,rgb(245_245_245/0.4)_78%_100%)] bg-[length:300%_100%] bg-clip-text bg-no-repeat text-transparent motion-safe:animate-text-shimmer ${className}`}
		>
			{children}
		</span>
	);
}
