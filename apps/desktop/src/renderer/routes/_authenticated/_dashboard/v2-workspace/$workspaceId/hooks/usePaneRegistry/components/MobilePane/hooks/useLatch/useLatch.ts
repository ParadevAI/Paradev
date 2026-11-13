import { useState } from "react";

/** True from the first render where `condition` holds, until unmount. */
export function useLatch(condition: boolean): boolean {
	const [latched, setLatched] = useState(condition);
	if (condition && !latched) setLatched(true);
	return latched || condition;
}
