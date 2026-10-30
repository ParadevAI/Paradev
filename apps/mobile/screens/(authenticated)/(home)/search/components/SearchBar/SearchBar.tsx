import { Stack } from "expo-router";
import { useCallback, useImperativeHandle, useRef } from "react";
import { type TextInput, View } from "react-native";
import { Input } from "@/components/ui/input";
import type { SearchBarComponent } from "./SearchBar.types";

/** A form sheet draws no native bar here, so the field is the header, drawn in JS. */
export const SearchBar: SearchBarComponent = ({
	ref,
	placeholder,
	onChangeText,
}) => {
	const inputRef = useRef<TextInput>(null);
	useImperativeHandle(ref, () => ({
		focus: () => inputRef.current?.focus(),
	}));
	const header = useCallback(
		() => (
			<View className="bg-background gap-2 px-4 pb-2 pt-2">
				<View className="bg-muted-foreground/40 h-1 w-8 self-center rounded-full" />
				<Input
					ref={inputRef}
					placeholder={placeholder}
					onChangeText={onChangeText}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="search"
					clearButtonMode="while-editing"
				/>
			</View>
		),
		[placeholder, onChangeText],
	);
	return <Stack.Screen options={{ headerShown: true, header }} />;
};
