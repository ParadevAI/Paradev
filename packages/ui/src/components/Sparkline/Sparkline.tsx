import { curveMonotoneX, line } from "d3-shape";

export interface SparklineProps {
	points: number[];
	title: string;
	width?: number;
	height?: number;
	className?: string;
}

const PADDING = 2;

export function Sparkline({
	points,
	title,
	width = 80,
	height = 20,
	className,
}: SparklineProps) {
	if (points.length === 0) return null;
	const values = points.length === 1 ? [...points, ...points] : points;
	const top = Math.max(...values, 0) || 1;
	const path = line<number>()
		.curve(curveMonotoneX)
		.x((_, i) => (i * width) / (values.length - 1))
		.y((value) => height - PADDING - (value / top) * (height - 2 * PADDING));
	return (
		<svg
			role="img"
			aria-label={title}
			height={height}
			width={width}
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			style={{ display: "block", width: "100%", maxWidth: width }}
			className={className}
		>
			<title>{title}</title>
			<path
				d={path(values) ?? ""}
				fill="transparent"
				className="stroke-chart-1"
				strokeWidth={2}
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
