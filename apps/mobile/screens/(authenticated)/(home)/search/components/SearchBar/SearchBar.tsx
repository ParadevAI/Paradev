import { Stack } from "expo-router";
import { useCallback, useImperativeHandle, useRef } from "react";
import { TextInput, type TextInputInstance, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { focusOnMount } from "./focusOnMount";
import type { SearchBarComponent } from "./SearchBar.types";

/** A form sheet draws no native bar here, so the field is the header, drawn in JS. */
export const SearchBar: SearchBarComponent = ({
	ref,
	placeholder,
	onChangeText,
	onSubmit,
}) => {
	const theme = useTheme();
	const inputRef = useRef<TextInputInstance>(null);
	useImperativeHandle(ref, () => ({
		focus: () => inputRef.current?.focus(),
	}));
	const header = useCallback(
		() => (
			<View className="bg-background gap-2 px-4 pb-2 pt-2">
				<View className="bg-muted-foreground/40 web:hidden h-1 w-8 self-center rounded-full" />
				<TextInput
					ref={inputRef}
					className="bg-input/30 border-input text-foreground min-h-10 rounded-md border px-3 py-2 text-base"
					placeholder={placeholder}
					placeholderTextColor={theme.mutedForeground}
					selectionColor={theme.mutedForeground}
					cursorColor={theme.foreground}
					onChangeText={onChangeText}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="search"
					autoFocus={focusOnMount}
					onSubmitEditing={onSubmit}
				/>
			</View>
		),
		[placeholder, onChangeText, onSubmit, theme],
	);
	return <Stack.Screen options={{ headerShown: true, header }} />;
};
