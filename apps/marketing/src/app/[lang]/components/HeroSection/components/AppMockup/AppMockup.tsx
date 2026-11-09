"use client";

import { MotionConfig, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { EdgeGlare } from "@/app/[lang]/components/EdgeGlare";
import { LeftSidebar } from "./components/LeftSidebar";
import { MainPanel } from "./components/MainPanel";
import { PagePopup } from "./components/PagePopup";
import { RightSidebar } from "./components/RightSidebar";
import { TabBar } from "./components/TabBar";
import { PAGE_PHASE_MS, PAGE_PHASES } from "./constants";
import { useLoopPhase } from "./hooks/useLoopPhase";
import type { AppMockupProps } from "./types";

export type { ActiveDemo } from "./types";

// The mockup is laid out at a fixed app-window size and scaled to fit its
// container, so type and chrome stay proportional like a real screenshot
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

export function AppMockup({
	activeDemo = "Cloud Workspaces",
	edgeGlare = false,
}: AppMockupProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0.72);
	const isPages = activeDemo === "Publish Pages";
	const prefersReducedMotion = useReducedMotion() ?? false;
	const [reducedMotion, setReducedMotion] = useState(false);
	useEffect(() => {
		setReducedMotion(prefersReducedMotion);
	}, [prefersReducedMotion]);
	const loopedPhase =
		PAGE_PHASES[useLoopPhase(isPages && !reducedMotion, PAGE_PHASE_MS)] ??
		"published";
	const pagePhase = reducedMotion ? "revised" : loopedPhase;

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => {
			setScale(el.clientWidth / DESIGN_WIDTH);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<MotionConfig reducedMotion="user">
			<div
				ref={containerRef}
				className="relative w-full min-w-[700px] overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_16px_40px_-12px_rgba(0,0,0,0.6),0_32px_90px_-24px_rgba(0,0,0,0.75)]"
				style={{ aspectRatio: "16/10" }}
			>
				{/* Edge lighting: brighter hairline along the top edge, dimmer sides */}
				<div className="pointer-events-none absolute inset-0 z-20 rounded-xl ring-1 ring-inset ring-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]" />
				{edgeGlare && (
					<EdgeGlare
						radius={480}
						strength={0.6}
						unscale
						className="inset-0 z-20 rounded-[inherit]"
					/>
				)}
				{/* Bottom dissolve: the window fades into the page instead of ending
			    on a hard border */}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[10%] bg-gradient-to-b from-transparent to-background" />

				<div
					className="absolute left-0 top-0 origin-top-left"
					style={{
						width: DESIGN_WIDTH,
						height: DESIGN_HEIGHT,
						transform: `scale(${scale})`,
					}}
				>
					<div className="flex h-full">
						<LeftSidebar activeDemo={activeDemo} />
						<div className="flex min-w-0 flex-1 flex-col">
							<TabBar activeDemo={activeDemo} />
							<MainPanel activeDemo={activeDemo} pagePhase={pagePhase} />
						</div>
						<RightSidebar activeDemo={activeDemo} />
					</div>

					<PagePopup visible={isPages} phase={pagePhase} />
				</div>
			</div>
		</MotionConfig>
	);
}
