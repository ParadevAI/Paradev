import { TabVisibilityContext } from "@superset/panes";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";

export type SidebarSlideMode = "closed" | "open" | "expanded";

interface SidebarSlideProps {
	mode: SidebarSlideMode;
	width: number;
	onLayoutFrame?: () => void;
	keepMounted?: boolean;
	alwaysMounted?: boolean;
	durationMs?: number;
	edge?: "left" | "right";
	children: (fill: boolean) => React.ReactNode;
}

export function SidebarSlide({
	mode,
	width,
	onLayoutFrame,
	keepMounted = false,
	alwaysMounted = false,
	durationMs = 300,
	edge = "right",
	children,
}: SidebarSlideProps) {
	const [settled, setSettled] = useState<SidebarSlideMode>(mode);
	const [move, setMove] = useState<{
		from: SidebarSlideMode;
		to: SidebarSlideMode;
		/** Where a move that reverses another one starts: the width on screen. */
		fromWidth: number | undefined;
	} | null>(null);
	const [armed, setArmed] = useState(false);
	const [hasOpened, setHasOpened] = useState(mode !== "closed");
	const headingRef = useRef(mode);
	const slideRef = useRef<HTMLDivElement>(null);
	const movingRef = useRef(false);
	const onLayoutFrameRef = useRef(onLayoutFrame);
	onLayoutFrameRef.current = onLayoutFrame;

	useEffect(() => {
		const from = headingRef.current;
		if (from === mode) return;
		headingRef.current = mode;
		const fromWidth = movingRef.current
			? slideRef.current?.getBoundingClientRect().width
			: undefined;
		movingRef.current = true;
		if (mode !== "closed") setHasOpened(true);
		setMove({ from, to: mode, fromWidth });
		setArmed(false);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => {
				setArmed(true);
				timer = setTimeout(() => {
					cancelAnimationFrame(layoutFrame);
					movingRef.current = false;
					setSettled(mode);
					setMove(null);
				}, durationMs);
			});
		});
		let layoutFrame = requestAnimationFrame(function follow() {
			onLayoutFrameRef.current?.();
			layoutFrame = requestAnimationFrame(follow);
		});
		return () => {
			cancelAnimationFrame(frame);
			cancelAnimationFrame(layoutFrame);
			clearTimeout(timer);
		};
	}, [mode, durationMs]);

	useEffect(() => {
		if (!move) onLayoutFrameRef.current?.();
	}, [move]);

	if (!alwaysMounted && !hasOpened) return null;
	if (!alwaysMounted && !keepMounted && !move && settled === "closed")
		return null;

	// Settled open lays the panel out in flow so a drag-resize sizes everything
	// from the panel itself. The element tree stays the same in every mode, so
	// switching never remounts the panes.
	const inFlow = !move && settled === "open";
	const hidden = !move && settled === "closed";
	const widthOf = (m: SidebarSlideMode) =>
		m === "closed" ? 0 : m === "open" ? width : "100%";
	const fill = move
		? move.from === "expanded" || move.to === "expanded"
		: settled === "expanded";
	const panelWidth = move
		? armed
			? widthOf(move.to)
			: (move.fromWidth ?? widthOf(move.from))
		: widthOf(settled);
	const contentWidth = fill ? "100%" : width;
	const transition = {
		transitionProperty: "width",
		transitionDuration: move && armed ? `${durationMs}ms` : "0ms",
		willChange: move ? "width" : undefined,
	};

	return (
		<div
			ref={slideRef}
			data-sidebar-slide=""
			className="relative flex h-full shrink-0 ease-[ease] motion-reduce:transition-none"
			style={{ width: inFlow ? undefined : panelWidth, ...transition }}
		>
			<div
				data-browser-layer={inFlow ? undefined : "raised"}
				className={cn(
					"overflow-hidden",
					inFlow ? "flex h-full" : "absolute inset-0 z-30",
				)}
			>
				<div
					inert={hidden}
					className={cn(
						"flex",
						inFlow
							? "h-full"
							: cn(
									"absolute inset-y-0",
									edge === "left" ? "left-0" : "right-0",
								),
						hidden && "invisible",
					)}
					style={{
						width: inFlow ? undefined : contentWidth,
						contain: move ? "strict" : undefined,
					}}
				>
					<TabVisibilityContext.Provider value={!hidden}>
						{children(fill)}
					</TabVisibilityContext.Provider>
				</div>
			</div>
		</div>
	);
}
