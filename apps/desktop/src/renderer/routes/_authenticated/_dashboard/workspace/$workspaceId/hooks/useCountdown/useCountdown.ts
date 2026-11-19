import { useEffect, useState } from "react";

/** Seconds left of `fromSeconds`, counting down once a second to 0. */
export function useCountdown(fromSeconds: number): number {
	const [secondsLeft, setSecondsLeft] = useState(fromSeconds);
	useEffect(() => {
		setSecondsLeft(fromSeconds);
		if (fromSeconds <= 0) return;
		const interval = setInterval(() => {
			setSecondsLeft((current) => Math.max(0, current - 1));
		}, 1000);
		return () => clearInterval(interval);
	}, [fromSeconds]);
	return secondsLeft;
}
