import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";

interface ResizablePanelProps {
	/** The content to render inside the panel */
	children: React.ReactNode;
	/** Current width of the panel */
	width: number;
	/** Callback when width changes */
	onWidthChange: (width: number) => void;
	/** Called when a drag starts and ends. */
	onResizingChange?: (isResizing: boolean) => void;
	/** Minimum allowed width (used for clamping and aria) */
	minWidth: number;
	/** Maximum allowed width (used for clamping and aria) */
	maxWidth: number;
	/** Which side the resize handle should be on */
	handleSide: "left" | "right";
	/** Additional className for the container */
	className?: string;
	/**
	 * If true, the component will clamp width between minWidth and maxWidth.
	 * If false, raw width values are passed to onWidthChange (useful when the
	 * consumer's setWidth handles clamping/snapping logic).
	 * @default true
	 */
	clampWidth?: boolean;
	/** Callback when the resize handle is double-clicked */
	onDoubleClickHandle?: () => void;
	/** How long the width eases to the value set by a double-click. */
	resetDurationMs?: number;
	/** Call `onWidthChange` once on release instead of on every drag frame. */
	commitOnRelease?: boolean;
	/**
	 * Renders as a flexible, full-width panel with no resize handle instead
	 * of a fixed-width one — for a sibling pane that can be collapsed, so
	 * this panel keeps the same element type (and its children stay mounted)
	 * across both states rather than swapping between this and a plain div.
	 * @default false
	 */
	disabled?: boolean;
}

export function ResizablePanel({
	children,
	width,
	onWidthChange,
	onResizingChange,
	minWidth,
	maxWidth,
	handleSide,
	className,
	clampWidth = true,
	onDoubleClickHandle,
	resetDurationMs = 300,
	disabled = false,
	commitOnRelease = false,
}: ResizablePanelProps) {
	// Owned here rather than by the consumer: a drag start or end that set
	// state in a large parent re-rendered the whole page on every click.
	const [isResizing, setIsResizing] = useState(false);
	const onResizingChangeRef = useRef(onResizingChange);
	onResizingChangeRef.current = onResizingChange;
	const setResizing = useCallback((next: boolean) => {
		setIsResizing(next);
		onResizingChangeRef.current?.(next);
	}, []);
	const [draftWidth, setDraftWidth] = useState<number | null>(null);
	const [committedWidth, setCommittedWidth] = useState(width);
	const draftWidthRef = useRef<number | null>(null);
	// The committed width arrives through `width`; hold the draft until then so
	// the panel does not flash back to its old width for a frame.
	if (width !== committedWidth) {
		setCommittedWidth(width);
		if (!isResizing) setDraftWidth(null);
	}
	useEffect(() => {
		if (draftWidth === null) draftWidthRef.current = null;
	}, [draftWidth]);
	const shownWidth = draftWidth ?? width;
	const [resetting, setResetting] = useState(false);
	useEffect(() => {
		if (!resetting) return;
		const timer = setTimeout(() => setResetting(false), resetDurationMs);
		return () => clearTimeout(timer);
	}, [resetting, resetDurationMs]);
	const handleDoubleClick = useCallback(() => {
		if (!onDoubleClickHandle) return;
		setResetting(true);
		onDoubleClickHandle();
	}, [onDoubleClickHandle]);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const pendingWidthRef = useRef<number | null>(null);
	const rafIdRef = useRef<number | null>(null);

	const flushPendingWidth = useCallback(() => {
		const pendingWidth = pendingWidthRef.current;
		pendingWidthRef.current = null;
		if (pendingWidth === null) return;
		if (commitOnRelease) {
			draftWidthRef.current = pendingWidth;
			setDraftWidth(pendingWidth);
		} else onWidthChange(pendingWidth);
	}, [onWidthChange, commitOnRelease]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startXRef.current = e.clientX;
			startWidthRef.current = shownWidth;
			setResizing(true);
		},
		[shownWidth, setResizing],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;

			const delta = e.clientX - startXRef.current;
			// For left handle, dragging left increases width (invert delta)
			// For right handle, dragging right increases width (normal delta)
			const adjustedDelta = handleSide === "left" ? -delta : delta;
			const newWidth = startWidthRef.current + adjustedDelta;
			const finalWidth = clampWidth
				? Math.max(minWidth, Math.min(maxWidth, newWidth))
				: newWidth;
			pendingWidthRef.current = finalWidth;

			if (rafIdRef.current !== null) return;
			rafIdRef.current = requestAnimationFrame(() => {
				rafIdRef.current = null;
				flushPendingWidth();
			});
		},
		[isResizing, minWidth, maxWidth, handleSide, clampWidth, flushPendingWidth],
	);

	const handleMouseUp = useCallback(() => {
		if (!isResizing) return;

		if (rafIdRef.current !== null) {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = null;
		}
		flushPendingWidth();
		if (commitOnRelease && draftWidthRef.current !== null) {
			onWidthChange(draftWidthRef.current);
		}
		setResizing(false);
	}, [
		isResizing,
		setResizing,
		flushPendingWidth,
		commitOnRelease,
		onWidthChange,
	]);

	useEffect(() => {
		if (isResizing) {
			setResetting(false);
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
			pendingWidthRef.current = null;
		};
	}, [isResizing, handleMouseMove, handleMouseUp]);

	return (
		<div
			className={cn(
				"relative h-full overflow-hidden border-border",
				disabled ? "flex-1" : "shrink-0",
				!disabled && (handleSide === "right" ? "border-r" : "border-l"),
				resetting &&
					"transition-[width] ease-[ease] motion-reduce:transition-none",
				className,
			)}
			style={
				disabled
					? undefined
					: {
							width: shownWidth,
							transitionDuration: resetting
								? `${resetDurationMs}ms`
								: undefined,
						}
			}
		>
			{children}
			{!disabled && (
				// biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles
				<div
					role="separator"
					aria-orientation="vertical"
					aria-valuenow={shownWidth}
					aria-valuemin={minWidth}
					aria-valuemax={maxWidth}
					tabIndex={0}
					onMouseDown={handleMouseDown}
					onDoubleClick={handleDoubleClick}
					className={cn(
						"absolute top-0 w-5 h-full cursor-col-resize z-10",
						"after:absolute after:top-0 after:w-1 after:h-full after:transition-colors",
						"hover:after:bg-border focus:outline-none focus:after:bg-border",
						isResizing && "after:bg-border",
						handleSide === "left"
							? "-left-2 after:right-2"
							: "-right-2 after:left-2",
					)}
				/>
			)}
		</div>
	);
}
