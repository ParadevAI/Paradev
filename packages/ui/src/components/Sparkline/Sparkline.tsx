import { curveMonotoneX, line } from "d3-shape";

export interface SparklineProps {
	/** Non-negative numbers: the scale runs from zero to the highest point. */
	points: number[];
	title: string;
	className?: string;
}

const WIDTH = 80;
const HEIGHT = 20;
const PADDING = 2;

export function Sparkline({ points, title, className }: SparklineProps) {
	if (points.length === 0) return null;
	const values = points.length === 1 ? [...points, ...points] : points;
	const top = Math.max(...values) || 1;
	const path = line<number>()
		.curve(curveMonotoneX)
		.x((_, i) => (i * WIDTH) / (values.length - 1))
		.y((value) => HEIGHT - PADDING - (value / top) * (HEIGHT - 2 * PADDING));
	return (
		<svg
			role="img"
			aria-label={title}
			height={HEIGHT}
			width={WIDTH}
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			preserveAspectRatio="none"
			style={{ display: "block", width: "100%" }}
			className={className}
		>
			<path
				d={path(values) ?? ""}
				fill="none"
				className="stroke-chart-1"
				strokeWidth={2}
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
