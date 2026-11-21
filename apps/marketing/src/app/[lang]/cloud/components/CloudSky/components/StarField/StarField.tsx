import { STARS } from "./constants";

export function StarField() {
	return (
		<div className="absolute inset-0">
			{STARS.map((star) =>
				star.sparkle ? (
					<span
						key={`${star.x}-${star.y}`}
						className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 text-white/70"
						style={{ left: `${star.x}%`, top: `${star.y}%` }}
					>
						<span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-current" />
						<span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-current" />
					</span>
				) : (
					<span
						key={`${star.x}-${star.y}`}
						className="absolute size-px bg-white/50"
						style={{ left: `${star.x}%`, top: `${star.y}%` }}
					/>
				),
			)}
		</div>
	);
}
