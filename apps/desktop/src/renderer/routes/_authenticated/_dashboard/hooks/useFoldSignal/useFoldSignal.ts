import { useCallback, useState } from "react";

/** Pulse from an expand-all / collapse-all control. `epoch` is 0 until the first press. */
export interface FoldSignal {
	epoch: number;
	action: "collapse" | "expand";
}

export function useFoldSignal() {
	const [foldSignal, setFoldSignal] = useState<FoldSignal>({
		epoch: 0,
		action: "expand",
	});
	const collapsed = foldSignal.epoch > 0 && foldSignal.action === "collapse";
	const toggleFold = useCallback(
		() =>
			setFoldSignal((s) => {
				const wasCollapsed = s.epoch > 0 && s.action === "collapse";
				return {
					epoch: s.epoch + 1,
					action: wasCollapsed ? "expand" : "collapse",
				};
			}),
		[],
	);
	return { foldSignal, collapsed, toggleFold };
}
