"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const BASE_LENGTH = 100;

const LAYOUT = {
	horizontal: {
		frame:
			"overflow-x-auto scrollbar-hide shadow-[inset_0_-1px_0_rgb(255_255_255/0.1)]",
		row: "w-max min-w-full items-center gap-1 px-4 sm:px-0",
		light: "bottom-0 left-0 h-[3px] origin-left",
		glow: "bg-gradient-to-r",
		line: "inset-x-0 bottom-0 h-px bg-gradient-to-r",
	},
	vertical: {
		frame: "shadow-[inset_1px_0_0_rgb(255_255_255/0.1)]",
		row: "flex-col gap-1",
		light: "top-0 left-0 w-[3px] origin-top",
		glow: "bg-gradient-to-b",
		line: "inset-y-0 left-0 w-px bg-gradient-to-b",
	},
} as const;

interface SelectorTrackProps {
	orientation: keyof typeof LAYOUT;
	activeKey: string;
	children: ReactNode;
	className?: string;
}

export function SelectorTrack({
	orientation,
	activeKey,
	children,
	className = "",
}: SelectorTrackProps) {
	const rowRef = useRef<HTMLDivElement>(null);
	const [segment, setSegment] = useState<{ start: number; length: number }>();
	const isHorizontal = orientation === "horizontal";
	const layout = LAYOUT[orientation];

	// biome-ignore lint/correctness/useExhaustiveDependencies: activeKey changes which button is pressed
	useEffect(() => {
		const row = rowRef.current;
		if (!row) return;
		const measure = () => {
			const active = row.querySelector<HTMLElement>('[aria-pressed="true"]');
			if (!active) return;
			setSegment(
				isHorizontal
					? { start: active.offsetLeft, length: active.offsetWidth }
					: { start: active.offsetTop, length: active.offsetHeight },
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		return () => observer.disconnect();
	}, [activeKey, isHorizontal]);

	const scale = (segment?.length ?? 0) / BASE_LENGTH;

	return (
		<div className={`${layout.frame} ${className}`}>
			<div ref={rowRef} className={`relative flex ${layout.row}`}>
				{children}
				{segment && segment.length > 0 && (
					<span
						aria-hidden="true"
						className={`pointer-events-none absolute transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${layout.light}`}
						style={
							isHorizontal
								? {
										width: BASE_LENGTH,
										transform: `translateX(${segment.start}px) scaleX(${scale})`,
									}
								: {
										height: BASE_LENGTH,
										transform: `translateY(${segment.start}px) scaleY(${scale})`,
									}
						}
					>
						<span
							className={`absolute inset-0 from-transparent via-foreground/40 to-transparent blur-[3px] ${layout.glow}`}
						/>
						<span
							className={`absolute from-transparent via-foreground/70 to-transparent ${layout.line}`}
						/>
					</span>
				)}
			</div>
		</div>
	);
}
