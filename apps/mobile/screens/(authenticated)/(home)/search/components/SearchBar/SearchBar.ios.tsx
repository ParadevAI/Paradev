import { Stack } from "expo-router";
import { useImperativeHandle, useRef } from "react";
import type { SearchBarCommands } from "react-native-screens";
import { useTheme } from "@/hooks/useTheme";
import type { SearchBarComponent } from "./SearchBar.types";

export const SearchBar: SearchBarComponent = ({
	ref,
	placeholder,
	onChangeText,
	onCancel,
}) => {
	const theme = useTheme();
	const searchBarRef = useRef<SearchBarCommands>(null);
	useImperativeHandle(ref, () => ({
		focus: () => searchBarRef.current?.focus(),
	}));
	return (
		<Stack.SearchBar
			ref={searchBarRef}
			placeholder={placeholder}
			placement="stacked"
			hideWhenScrolling={false}
			hideNavigationBar={false}
			obscureBackground={false}
			textColor={theme.foreground}
			hintTextColor={theme.mutedForeground}
			tintColor={theme.foreground}
			onChangeText={(event) => onChangeText(event.nativeEvent.text)}
			onCancelButtonPress={onCancel}
		/>
	);
};
