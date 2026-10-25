"use client";

import { useLingui } from "@lingui/react/macro";
import { m, useMotionValue, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { type ActiveDemo, AppMockup } from "../AppMockup";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

// Scroll range (px) over which the demo docks and the selector opens
const DOCK_START = 20;
const DOCK_END = 280;
// w-54 radio list + 24px gutter to the mockup
const SELECTOR_WIDTH = 240;
// The 16:10 mockup is this much shorter once docked beside the selector
const DOCKED_HEIGHT_LOSS = (SELECTOR_WIDTH * 10) / 16;
// Undocked hero state: larger than the container and pushed down
const HERO_SCALE = 1.08;
const HERO_Y = 56;

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<ActiveDemo>(
		"Orchestrate Parallel Agents",
	);
	const { t } = useLingui();

	// Scroll-scrubbed progress, tied 1:1 to scroll so it never drifts
	const { scrollY } = useScroll();
	const progress = useTransform(scrollY, [DOCK_START, DOCK_END], [0, 1]);

	// Docking must not change layout: Chrome counts shifts during scroll as CLS
	const mockupAreaRef = useRef<HTMLDivElement>(null);
	const mockupAreaWidth = useMotionValue(0);
	useEffect(() => {
		const el = mockupAreaRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => {
			mockupAreaWidth.set(el.clientWidth);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [mockupAreaWidth]);

	const selectorClip = useTransform(
		progress,
		(p) => `inset(0 ${(1 - p) * SELECTOR_WIDTH}px 0 0)`,
	);
	const selectorOpacity = useTransform(progress, [0.4, 1], [0, 1]);
	const dockScale = useTransform(
		[progress, mockupAreaWidth],
		([p = 0, width = 0]: number[]) => {
			if (width <= SELECTOR_WIDTH) return 1;
			const docked = (width - SELECTOR_WIDTH) / width;
			return 1 + p * (docked - 1);
		},
	);
	const mockupScale = useTransform(progress, [0, 1], [HERO_SCALE, 1]);
	const mockupY = useTransform(progress, [0, 1], [HERO_Y, 0]);

	const options = DEMO_OPTIONS.map((option) => (
		<SelectorPill
			key={option.id}
			label={t(option.label)}
			active={activeOption === option.id}
			onSelect={() => setActiveOption(option.id)}
		/>
	));

	return (
		<div className="relative w-full max-w-full flex flex-col gap-4 lg:flex-row lg:gap-0">
			{/* Mobile/tablet: static horizontal strip */}
			<div className="flex items-center gap-2 px-4 overflow-x-auto scrollbar-hide sm:px-0 lg:hidden">
				{options}
			</div>

			{/* Desktop: vertical radio column, opened by scroll */}
			<m.div
				className="hidden lg:flex absolute top-0 left-0 z-10 flex-col justify-center"
				style={{
					bottom: DOCKED_HEIGHT_LOSS,
					clipPath: selectorClip,
					opacity: selectorOpacity,
				}}
			>
				<div className="w-60 pr-6 flex flex-col gap-1">{options}</div>
			</m.div>

			{/* Mockup: oversized, lower hero state that docks as you scroll */}
			<div ref={mockupAreaRef} className="relative flex-1 min-w-0">
				<m.div
					className="max-lg:transform-none!"
					style={{ scale: dockScale, transformOrigin: "100% 0%" }}
				>
					{/* The 8% oversize needs viewport gutter, so below 1440px the
					    stylesheet cancels the transform. A media query in JS would only
					    apply after hydration and make the mockup jump on load. */}
					<m.div
						className="relative max-[1440px]:transform-none!"
						style={{
							scale: mockupScale,
							y: mockupY,
							transformOrigin: "100% 100%",
						}}
					>
						{/* Stage lighting: soft ember-tinted glow behind the top of the
						    window, falling off to the page black at the edges */}
						<div
							className="pointer-events-none absolute -inset-x-[25%] -top-[30%] bottom-0"
							style={{
								background:
									"radial-gradient(ellipse 42% 38% at 50% 22%, rgba(232,128,74,0.06), rgba(232,128,74,0.02) 55%, transparent 78%)",
							}}
						/>
						<div className="relative overflow-x-auto scrollbar-hide max-md:[mask-image:linear-gradient(to_right,black_88%,transparent)]">
							<AppMockup activeDemo={activeOption} />
						</div>
					</m.div>
				</m.div>
			</div>
		</div>
	);
}
