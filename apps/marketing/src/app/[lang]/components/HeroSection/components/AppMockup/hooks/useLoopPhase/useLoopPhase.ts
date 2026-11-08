import { useEffect, useState } from "react";

export function useLoopPhase(
	active: boolean,
	durationsMs: readonly number[],
): number {
	const [phase, setPhase] = useState(0);

	useEffect(() => {
		setPhase(0);
		if (!active) return;
		let current = 0;
		let timer: ReturnType<typeof setTimeout>;
		const advance = () => {
			timer = setTimeout(() => {
				current = (current + 1) % durationsMs.length;
				setPhase(current);
				advance();
			}, durationsMs[current]);
		};
		advance();
		return () => clearTimeout(timer);
	}, [active, durationsMs]);

	return phase;
}
