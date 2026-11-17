import { useCallback, useEffect, useState } from "react";

/** A request's answer, or that it failed, or neither while it loads. */
export interface Loaded<T> {
	data: T | null;
	hasFailed: boolean;
	retry: () => void;
}

/** Runs `load` when it changes, dropping the last answer at once. */
export function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
	const [data, setData] = useState<T | null>(null);
	const [hasFailed, setHasFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` runs the load again
	useEffect(() => {
		let isCurrent = true;
		setData(null);
		setHasFailed(false);
		load().then(
			(value) => isCurrent && setData(value),
			() => isCurrent && setHasFailed(true),
		);
		return () => {
			isCurrent = false;
		};
	}, [load, attempt]);
	return {
		data,
		hasFailed,
		retry: useCallback(() => setAttempt((count) => count + 1), []),
	};
}
