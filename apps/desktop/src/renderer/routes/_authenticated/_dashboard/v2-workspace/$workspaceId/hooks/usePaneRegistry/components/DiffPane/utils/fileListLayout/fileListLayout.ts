export const FILE_LIST_MIN_WIDTH = 180;
// Below this the diff's file headers drop the file names.
export const MIN_DIFF_WIDTH = 360;

export type FileListLayout = "docked" | "overlay" | "hidden";

export function fileListLayout({
	containerWidth,
	open,
}: {
	containerWidth: number | null;
	/** The person's choice from the Files button; null until they use it. */
	open: boolean | null;
}): FileListLayout {
	if (containerWidth === null) return "hidden";
	if (fitsDocked(containerWidth)) return open === false ? "hidden" : "docked";
	return open === true ? "overlay" : "hidden";
}

/**
 * The Files button's next choice. Only a narrow pane stores `true`, so showing
 * the list in a wide pane doesn't pop an overlay once the pane narrows.
 */
export function toggledFileListOpen(state: {
	containerWidth: number | null;
	open: boolean | null;
}): boolean | null {
	const fits =
		state.containerWidth !== null && fitsDocked(state.containerWidth);
	if (fileListLayout(state) === "hidden") return fits ? null : true;
	return fits ? false : null;
}

function fitsDocked(containerWidth: number): boolean {
	return containerWidth - MIN_DIFF_WIDTH >= FILE_LIST_MIN_WIDTH;
}
