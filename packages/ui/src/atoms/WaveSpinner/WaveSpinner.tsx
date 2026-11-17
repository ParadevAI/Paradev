import { cn } from "../../lib/utils";

const DIAGONAL_DELAY_MS = 100;
const CELLS = Array.from({ length: 9 }, (_, index) => ({
	id: index,
	diagonal: Math.floor(index / 3) + (index % 3),
}));

interface WaveSpinnerProps {
	className?: string;
}

// CSS-driven: a JS frame timer re-rendered React 20x/s per spinner and froze
// with the main thread.
export function WaveSpinner({ className }: WaveSpinnerProps) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-[11px] shrink-0 grid-cols-[repeat(3,3px)] grid-rows-[repeat(3,3px)] gap-px",
				className,
			)}
		>
			{CELLS.map((cell) => (
				<span
					key={cell.id}
					className="animate-wave-cell rounded-[0.5px] bg-current"
					style={{ animationDelay: `${cell.diagonal * DIAGONAL_DELAY_MS}ms` }}
				/>
			))}
		</span>
	);
}
