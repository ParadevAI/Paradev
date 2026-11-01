import { requestActionSheet } from "./actionSheetRequest";
import { showActionSheet as showAlertActionSheet } from "./showActionSheet";
import type { ShowActionSheet } from "./showActionSheet.types";

/** A Material bottom sheet, drawn by `ActionSheetHost`. */
export const showActionSheet: ShowActionSheet = (options, onSelect) => {
	if (!requestActionSheet({ options, onSelect }))
		showAlertActionSheet(options, onSelect);
};
