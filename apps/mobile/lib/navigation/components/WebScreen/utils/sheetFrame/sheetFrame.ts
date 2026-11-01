const DIALOG_MIN_WIDTH = 640;
const DIALOG_MAX_WIDTH = 560;
const DIALOG_MAX_HEIGHT = 720;
const DIALOG_MIN_HEIGHT = 320;

export interface SheetFrame {
	kind: "dialog" | "bottom";
	width: number;
	height: number;
}

/** Where a sheet sits on the web: a centred dialog on a wide window, a bottom sheet on a narrow one. */
export function sheetFrame(
	window: { width: number; height: number },
	detents: readonly number[],
): SheetFrame {
	const detent = Math.min(1, Math.max(...detents, 0.25));
	const wanted = Math.round(window.height * detent);
	if (window.width >= DIALOG_MIN_WIDTH) {
		const maxHeight = Math.min(DIALOG_MAX_HEIGHT, window.height - 64);
		return {
			kind: "dialog",
			width: Math.min(DIALOG_MAX_WIDTH, window.width - 32),
			height: Math.max(
				Math.min(wanted, maxHeight),
				Math.min(DIALOG_MIN_HEIGHT, maxHeight),
			),
		};
	}
	return {
		kind: "bottom",
		width: window.width,
		height: Math.min(wanted, window.height - 48),
	};
}
