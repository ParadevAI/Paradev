import { cn } from "@superset/ui/utils";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useState } from "react";
import { PanelResizeHandle } from "./components/PanelResizeHandle";
import {
	clampPanelWidth,
	defaultPanelWidth,
	maxPanelWidth,
	PANEL_COLLAPSE_WIDTH,
	PANEL_MIN_WIDTH,
} from "./utils/panelWidth";

export type ChannelPanelMode = "closed" | "open" | "expanded";

// Codex opens, closes and expands its side panel on this spring.
const PANEL_SPRING = { type: "spring", duration: 0.5, bounce: 0.1 } as const;
const INSTANT = { duration: 0 } as const;

interface ChannelPanelFrameProps {
	mode: ChannelPanelMode;
	containerWidth: number;
	/** The saved width, or null for the default. */
	width: number | null;
	onWidthChange: (width: number | null) => void;
	onCollapse: () => void;
	children: ReactNode;
}

/**
 * The channel's right panel as Codex draws it: the frame's width springs
 * open and shut while the content keeps its full width inside the clip, so
 * nothing reflows mid-animation, and the main column gives up exactly the
 * space the frame takes.
 */
export function ChannelPanelFrame({
	mode,
	containerWidth,
	width,
	onWidthChange,
	onCollapse,
	children,
}: ChannelPanelFrameProps) {
	const reduceMotion = useReducedMotion();
	const [drag, setDrag] = useState<number | null>(null);
	const [isMounted, setMounted] = useState(mode !== "closed");
	if (mode !== "closed" && !isMounted) setMounted(true);
	/** The mode the frame last finished moving to; only a change from it springs. */
	const [settledMode, setSettledMode] = useState(mode);
	const isToggling = mode !== settledMode;

	const openWidth =
		width === null
			? defaultPanelWidth(containerWidth)
			: clampPanelWidth(width, containerWidth);
	const dragCollapsed = drag !== null && drag < PANEL_COLLAPSE_WIDTH;
	const liveWidth =
		drag === null ? openWidth : clampPanelWidth(drag, containerWidth);
	const target =
		mode === "closed" || dragCollapsed
			? 0
			: mode === "expanded"
				? containerWidth
				: liveWidth;
	const contentWidth = mode === "expanded" ? containerWidth : liveWidth;
	const following = drag !== null && !dragCollapsed;

	return (
		<motion.div
			className="relative h-full shrink-0"
			initial={false}
			animate={{ width: target }}
			transition={
				isToggling && !reduceMotion && !following ? PANEL_SPRING : INSTANT
			}
			onAnimationComplete={() => {
				setSettledMode(mode);
				if (mode === "closed") setMounted(false);
			}}
		>
			<div className="absolute inset-0 overflow-hidden">
				<div
					inert={mode === "closed"}
					className={cn(
						"absolute inset-y-0 left-0 flex",
						mode !== "expanded" && "border-l border-border",
					)}
					style={{ width: contentWidth }}
				>
					{isMounted && children}
				</div>
			</div>
			{mode === "open" && (
				<>
					<div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-px shadow-[-8px_0_16px_-8px_rgb(0_0_0/0.18)]" />
					<PanelResizeHandle
						width={liveWidth}
						minWidth={PANEL_MIN_WIDTH}
						maxWidth={maxPanelWidth(containerWidth)}
						onDragStart={() => setDrag(openWidth)}
						onDrag={setDrag}
						onDragEnd={() => {
							if (dragCollapsed) onCollapse();
							else if (drag !== null) {
								onWidthChange(clampPanelWidth(drag, containerWidth));
							}
							setDrag(null);
						}}
						onStep={onWidthChange}
						onReset={() => onWidthChange(null)}
					/>
				</>
			)}
		</motion.div>
	);
}
