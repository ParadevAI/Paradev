import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect } from "react";
import type { UseSheetAutoFocus } from "./useSheetAutoFocus.types";

// `autoFocus` runs before the form sheet's window has focus: the input gets the
// cursor but the keyboard stays closed. Focus once the sheet is presented.
export const useSheetAutoFocus: UseSheetAutoFocus = (input) => {
	const navigation =
		useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
	useEffect(
		() =>
			navigation.addListener("transitionEnd", (event) => {
				if (!event.data.closing) input.current?.focus();
			}),
		[navigation, input],
	);
	return false;
};
