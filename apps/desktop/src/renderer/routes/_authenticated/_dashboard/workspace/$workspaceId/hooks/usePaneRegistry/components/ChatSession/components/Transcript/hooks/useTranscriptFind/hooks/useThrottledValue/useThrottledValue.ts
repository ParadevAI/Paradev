import { useEffect, useRef, useState } from "react";

export function useThrottledValue<T>(value: T, intervalMs: number): T {
	const [throttled, setThrottled] = useState(value);
	const latest = useRef(value);
	latest.current = value;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (timer.current !== null || Object.is(value, throttled)) return;
		timer.current = setTimeout(() => {
			timer.current = null;
			setThrottled(latest.current);
		}, intervalMs);
	}, [value, throttled, intervalMs]);

	useEffect(
		() => () => {
			if (timer.current !== null) clearTimeout(timer.current);
			timer.current = null;
		},
		[],
	);

	return throttled;
}
