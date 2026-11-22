export interface SparklineProps {
	points: number[];
	title: string;
	width?: number;
	height?: number;
	className?: string;
}

const PADDING = 1;

export function Sparkline({
	points,
	title,
	width = 96,
	height = 24,
	className,
}: SparklineProps) {
	const line = points.length === 1 ? [...points, ...points] : points;
	const top = Math.max(...line, 0) || 1;
	const x = (index: number) =>
		PADDING + (index * (width - 2 * PADDING)) / (line.length - 1);
	const y = (value: number) =>
		height - PADDING - (value / top) * (height - 2 * PADDING);
	return (
		<svg
			role="img"
			aria-label={title}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className={className}
		>
			<title>{title}</title>
			<polyline
				points={line.map((value, i) => `${x(i)},${y(value)}`).join(" ")}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
