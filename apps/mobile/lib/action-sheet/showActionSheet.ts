import { Alert } from "react-native";
import type { ShowActionSheet } from "./showActionSheet.types";

/** No native action sheet here, so the choices become an alert's buttons. */
export const showActionSheet: ShowActionSheet = (
	{ options, cancelButtonIndex, destructiveButtonIndex },
	onSelect,
) =>
	Alert.alert(
		"",
		undefined,
		options.map((text, index) => ({
			text,
			style:
				index === cancelButtonIndex
					? "cancel"
					: index === destructiveButtonIndex
						? "destructive"
						: "default",
			onPress: () => onSelect(index),
		})),
		{ cancelable: true },
	);
