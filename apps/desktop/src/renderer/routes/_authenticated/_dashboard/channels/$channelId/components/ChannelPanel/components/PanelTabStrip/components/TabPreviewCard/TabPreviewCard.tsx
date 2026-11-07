import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CARD_MAX_WIDTH = 320;
const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 2;

interface TabPreviewCardProps {
	cardKey: string;
	anchor: DOMRect;
	children: ReactNode;
}

/** Codex's tab hover card frame; it glides between tabs and fades its content. */
export function TabPreviewCard({
	cardKey,
	anchor,
	children,
}: TabPreviewCardProps) {
	const width = Math.min(
		CARD_MAX_WIDTH,
		window.innerWidth - VIEWPORT_PADDING * 2,
	);
	const x = Math.max(
		VIEWPORT_PADDING,
		Math.min(anchor.left, window.innerWidth - VIEWPORT_PADDING - width),
	);
	const y = anchor.bottom + ANCHOR_GAP;

	// The first frame lands in place; later anchors glide between tabs.
	const placed = useRef(false);
	const [glide, setGlide] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new anchor
	useEffect(() => {
		if (placed.current) setGlide(true);
		placed.current = true;
	}, [x, y]);

	return createPortal(
		<div
			role="tooltip"
			className={cn(
				"pointer-events-none fixed top-0 left-0 z-50 select-none",
				glide &&
					"transition-transform duration-150 ease-[cubic-bezier(.23,1,.32,1)] motion-reduce:transition-none",
			)}
			style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width }}
		>
			<div className="animate-in fade-in-0 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl ring-[0.5px] ring-border duration-150">
				<div
					key={cardKey}
					className="animate-in fade-in-0 flex flex-col gap-3 p-3 duration-150"
				>
					{children}
				</div>
			</div>
		</div>,
		document.body,
	);
}
