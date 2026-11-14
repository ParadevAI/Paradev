import type {
	AttachmentsSheetHandlers,
	PresentAttachmentsSheet,
} from "./AttachmentsSheet.types";

// The browser's file chooser is the sheet: on a phone it already offers the
// photo library, the camera and files.
export const presentAttachmentsSheet: PresentAttachmentsSheet = async (
	_theme,
	{ onAction },
) => {
	onAction("files");
	return true;
};

/** No sheet is ever drawn on web, so the root host has nothing to show. */
export function useAttachmentsSheetRequest(): AttachmentsSheetHandlers | null {
	return null;
}

export function settleAttachmentsSheet() {}
