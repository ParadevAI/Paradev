import { useState } from "react";

/** `value`, or the last one seen while it is null. */
export function useLastKnown<T>(value: T | null): T | null {
	const [last, setLast] = useState(value);
	if (value !== null && value !== last) setLast(value);
	return value ?? last;
}
