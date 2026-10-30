import type { PresentAttachmentsSheet } from "./AttachmentsSheet.types";

// The browser's file chooser is the sheet: on a phone it already offers the
// photo library, the camera and files.
export const presentAttachmentsSheet: PresentAttachmentsSheet = async (
	_theme,
	{ onAction },
) => {
	onAction("files");
	return true;
};
