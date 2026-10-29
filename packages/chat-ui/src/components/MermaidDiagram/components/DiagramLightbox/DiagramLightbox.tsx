import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { Minus, Plus, X } from "lucide-react";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useModalOverlay } from "../../../../hooks/useModalOverlay";
import { OverlayButton } from "../../../OverlayButton";
import "../../mermaid-diagram.css";
import { svgSize } from "./utils/svgSize";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const FIT_MAX_SCALE = 2;
const STAGE_PADDING = 48;
const STEP = 1.25;
const WHEEL_SENSITIVITY = 0.002;
const DRAG_THRESHOLD = 4;

type View = { scale: number; x: number; y: number };
type Drag = {
	pointerId: number;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	moved: boolean;
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/**
 * The diagram large on a dark scrim. The wheel zooms around the pointer, a
 * drag pans, Escape or a click beside the diagram closes.
 */
export function DiagramLightbox({
	label,
	onClose,
	svg,
}: {
	svg: string;
	label: string;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const stageRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<Drag | null>(null);
	const size = useMemo(() => svgSize(svg), [svg]);
	const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
	const [dragging, setDragging] = useState(false);

	const fit = useCallback(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const { width, height } = stage.getBoundingClientRect();
		const scale = clamp(
			Math.min(
				(width - STAGE_PADDING) / size.width,
				(height - STAGE_PADDING) / size.height,
				FIT_MAX_SCALE,
			),
			MIN_SCALE,
			MAX_SCALE,
		);
		setView({
			scale,
			x: (width - size.width * scale) / 2,
			y: (height - size.height * scale) / 2,
		});
	}, [size]);

	const zoomAt = useCallback((factor: number, px: number, py: number) => {
		setView((current) => {
			const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
			const ratio = scale / current.scale;
			return {
				scale,
				x: px - (px - current.x) * ratio,
				y: py - (py - current.y) * ratio,
			};
		});
	}, []);

	const zoomCenter = (factor: number) => {
		const stage = stageRef.current;
		if (!stage) return;
		const { width, height } = stage.getBoundingClientRect();
		zoomAt(factor, width / 2, height / 2);
	};

	useLayoutEffect(fit, [fit]);

	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const { left, top } = stage.getBoundingClientRect();
			zoomAt(
				Math.exp(-event.deltaY * WHEEL_SENSITIVITY),
				event.clientX - left,
				event.clientY - top,
			);
		};
		stage.addEventListener("wheel", onWheel, { passive: false });
		return () => stage.removeEventListener("wheel", onWheel);
	}, [zoomAt]);

	useModalOverlay(stageRef, onClose);

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: view.x,
			originY: view.y,
			moved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(true);
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
		drag.moved = true;
		setView((current) => ({
			...current,
			x: drag.originX + dx,
			y: drag.originY + dy,
		}));
	};
	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		dragRef.current = null;
		setDragging(false);
		event.currentTarget.releasePointerCapture(event.pointerId);
		if (!drag.moved && event.target === event.currentTarget) onClose();
	};

	return createPortal(
		<div
			aria-label={label}
			aria-modal="true"
			className="fixed inset-0 z-[100] bg-black/85"
			role="dialog"
		>
			<div
				className="absolute inset-0 touch-none select-none overflow-hidden outline-none"
				onPointerCancel={onPointerUp}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				ref={stageRef}
				style={{ cursor: dragging ? "grabbing" : "grab" }}
				tabIndex={-1}
			>
				<div
					className="absolute top-0 left-0 origin-top-left rounded-lg bg-background [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: the renderer escapes labels and the markup passed through sanitizeSvg
					dangerouslySetInnerHTML={{ __html: svg }}
					data-diagram-scale={view.scale}
					style={{
						width: size.width,
						height: size.height,
						transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
					}}
				/>
			</div>
			<div className="absolute top-4 right-4 flex items-center gap-2">
				<OverlayButton
					aria-label={t({ message: "Zoom out" })}
					disabled={view.scale <= MIN_SCALE}
					onClick={() => zoomCenter(1 / STEP)}
				>
					<Minus className="size-4" />
				</OverlayButton>
				<OverlayButton
					aria-label={t({ message: "Reset zoom" })}
					className="px-3 text-xs tabular-nums"
					onClick={fit}
				>
					{formatPercent(view.scale, { maximumFractionDigits: 0 })}
				</OverlayButton>
				<OverlayButton
					aria-label={t({ message: "Zoom in" })}
					disabled={view.scale >= MAX_SCALE}
					onClick={() => zoomCenter(STEP)}
				>
					<Plus className="size-4" />
				</OverlayButton>
				<OverlayButton aria-label={t({ message: "Close" })} onClick={onClose}>
					<X className="size-4" />
				</OverlayButton>
			</div>
		</div>,
		document.body,
	);
}
