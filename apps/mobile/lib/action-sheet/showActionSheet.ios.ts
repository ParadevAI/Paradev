import { ActionSheetIOS } from "react-native";
import type { ShowActionSheet } from "./showActionSheet.types";

export const showActionSheet: ShowActionSheet = (options, onSelect) =>
	ActionSheetIOS.showActionSheetWithOptions(options, onSelect);
