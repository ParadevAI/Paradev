"use client";

import { type CSSProperties, type ElementType, memo } from "react";
import { cn } from "../../lib/utils";

export type TextShimmerProps = {
	children: string;
	as?: ElementType;
	className?: string;
	duration?: number;
	spread?: number;
	variant?: "tool" | "text";
};

const ShimmerComponent = ({
	children,
	as: Component = "span",
	className,
	duration = 2,
	spread = 2,
	variant = "tool",
}: TextShimmerProps) => (
	<Component
		className={cn(
			variant === "tool"
				? "m-0 inline-flex h-4 items-center leading-none"
				: "inline-block",
			className,
			"relative text-[color-mix(in_oklab,var(--color-foreground)_40%,transparent)]",
			"motion-reduce:text-muted-foreground",
		)}
		style={
			{
				"--spread": `${(children?.length ?? 0) * spread}px`,
				"--shimmer-duration": `${duration}s`,
			} as CSSProperties
		}
	>
		{children}
		{/* Transform-only, so the sweep stays on the compositor. */}
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 animate-shimmer-window [mask-image:linear-gradient(90deg,#0000_calc(50%-var(--spread)),#000,#0000_calc(50%+var(--spread)))] motion-reduce:hidden"
		>
			<span
				data-text={children}
				className={cn(
					"size-full animate-shimmer-text overflow-hidden text-foreground [text-overflow:inherit] before:content-[attr(data-text)]",
					variant === "tool" ? "flex items-center" : "block",
				)}
			/>
		</span>
	</Component>
);

export const Shimmer = memo(ShimmerComponent);
