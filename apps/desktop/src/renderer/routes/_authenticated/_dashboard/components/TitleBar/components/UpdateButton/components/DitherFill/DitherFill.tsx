import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";

const CELL = 2;
const BAYER = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
];
/** Width of the dithered edge, as a share of the bar. */
const EDGE = 0.4;
const FRAME_MS = 60;
const SWEEP_MS = 2200;

interface DitherFillProps {
	/** 0-100, or null for a sweep with no known progress. */
	percent: number | null;
	className?: string;
}

function density(x: number, fill: number | null, time: number): number {
	if (fill !== null) {
		const breath = 0.025 * Math.sin(time / 420);
		return (fill * (1 + EDGE) + breath * Math.min(1, fill * 8) - x) / EDGE;
	}
	const center = ((time % SWEEP_MS) / SWEEP_MS) * (1 + 2 * EDGE) - EDGE;
	return 1 - Math.abs(x - center) / EDGE;
}

export function DitherFill({ percent, className }: DitherFillProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const targetRef = useRef(percent);
	targetRef.current = percent;

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;

		const columns = Math.ceil(canvas.clientWidth / CELL);
		const rows = Math.ceil(canvas.clientHeight / CELL);
		canvas.width = columns;
		canvas.height = rows;

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		let shown = (targetRef.current ?? 0) / 100;
		let frame = 0;
		let lastDraw = 0;

		const draw = (now: number) => {
			frame = requestAnimationFrame(draw);
			if (now - lastDraw < FRAME_MS) return;
			lastDraw = now;

			const target = targetRef.current;
			if (target !== null) shown += (target / 100 - shown) * 0.25;
			const time = reduceMotion ? 0 : now;
			const fill = target === null && !reduceMotion ? null : shown;

			context.clearRect(0, 0, columns, rows);
			context.fillStyle = getComputedStyle(canvas).color;
			for (let column = 0; column < columns; column++) {
				const level = density((column + 0.5) / columns, fill, time);
				if (level <= 0) continue;
				for (let row = 0; row < rows; row++) {
					const threshold = ((BAYER[row % 4]?.[column % 4] ?? 0) + 0.5) / 16;
					if (level > threshold) context.fillRect(column, row, 1, 1);
				}
			}
		};
		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	}, []);

	return (
		<span
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0", className)}
		>
			<canvas
				ref={canvasRef}
				className="size-full text-highlight [image-rendering:pixelated]"
			/>
		</span>
	);
}
