import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useRef, useState } from "react";

const KEYBOARD_STEP = 10;

interface PanelResizeHandleProps {
	width: number;
	minWidth: number;
	maxWidth: number;
	onDragStart: () => void;
	/** The width the pointer asks for, before clamping. */
	onDrag: (width: number) => void;
	onDragEnd: () => void;
	/** A keyboard step: the new width, already clamped. */
	onStep: (width: number) => void;
	onReset: () => void;
}

/** A 16px grab strip centred on the panel's left border, as in Codex. */
export function PanelResizeHandle({
	width,
	minWidth,
	maxWidth,
	onDragStart,
	onDrag,
	onDragEnd,
	onStep,
	onReset,
}: PanelResizeHandleProps) {
	const { t } = useLingui();
	const [isDragging, setDragging] = useState(false);
	const start = useRef<{ x: number; width: number } | null>(null);

	return (
		// biome-ignore lint/a11y/useSemanticElements: a separator that resizes needs focus and keys
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={t({ message: "Resize panel" })}
			aria-valuenow={Math.round(width)}
			aria-valuemin={minWidth}
			aria-valuemax={maxWidth}
			tabIndex={0}
			className="group/panel-resizer absolute inset-y-0 left-0 z-40 w-4 -translate-x-2 cursor-col-resize outline-none"
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				start.current = { x: event.clientX, width };
				setDragging(true);
				onDragStart();
			}}
			onPointerMove={(event) => {
				if (!start.current) return;
				onDrag(start.current.width + (start.current.x - event.clientX));
			}}
			onPointerUp={(event) => {
				if (!start.current) return;
				event.currentTarget.releasePointerCapture(event.pointerId);
				start.current = null;
				setDragging(false);
				onDragEnd();
			}}
			onDoubleClick={onReset}
			onKeyDown={(event) => {
				const next =
					event.key === "ArrowLeft"
						? width + KEYBOARD_STEP
						: event.key === "ArrowRight"
							? width - KEYBOARD_STEP
							: event.key === "Home"
								? minWidth
								: event.key === "End"
									? maxWidth
									: null;
				if (next === null) return;
				event.preventDefault();
				onStep(Math.min(maxWidth, Math.max(minWidth, next)));
			}}
		>
			<div
				className={cn(
					"pointer-events-none absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-foreground/25 to-transparent",
					isDragging
						? "opacity-100"
						: "opacity-0 group-hover/panel-resizer:opacity-100 group-focus-visible/panel-resizer:opacity-100",
				)}
			/>
		</div>
	);
}
