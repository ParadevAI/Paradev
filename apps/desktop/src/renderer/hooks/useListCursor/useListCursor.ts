import { useState } from "react";

/** -1 is Slack's resting state: the first item shows as picked but the keys have not moved yet. */
export function nextIndex(index: number, key: string, count: number): number {
	if (key === "ArrowDown") return index + 1 >= count ? -1 : index + 1;
	if (key === "ArrowUp") return index === -1 ? count - 1 : index - 1;
	return index;
}

/** The highlighted row of a picker, moved the way Slack's pickers move. */
export function useListCursor(count: number, resetKey: unknown) {
	const [index, setIndex] = useState(-1);
	const [lastKey, setLastKey] = useState(resetKey);
	if (resetKey !== lastKey) {
		setLastKey(resetKey);
		setIndex(-1);
	}
	const highlighted =
		count === 0 ? -1 : Math.min(Math.max(index, 0), count - 1);
	const move = (key: string): boolean => {
		if (count === 0 || (key !== "ArrowDown" && key !== "ArrowUp")) return false;
		setIndex((i) => nextIndex(Math.min(i, count - 1), key, count));
		return true;
	};
	return { highlighted, move, hover: setIndex };
}
