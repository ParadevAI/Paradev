export const FILE_LIST_MIN_WIDTH = 180;
// Below this the diff's file headers drop the file names.
export const MIN_DIFF_WIDTH = 360;

export type FileListLayout = "docked" | "overlay" | "hidden";

export function fileListLayout({
	containerWidth,
	open,
}: {
	containerWidth: number | null;
	/** The person's choice from the Files button, kept in user preferences. */
	open: boolean;
}): FileListLayout {
	if (containerWidth === null) return "hidden";
	if (!open) return "hidden";
	return fitsDocked(containerWidth) ? "docked" : "overlay";
}

function fitsDocked(containerWidth: number): boolean {
	return containerWidth - MIN_DIFF_WIDTH >= FILE_LIST_MIN_WIDTH;
}
