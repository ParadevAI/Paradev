import { useImperativeHandle, useRef } from "react";
import { TextInput, type TextInputInstance, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import type { InviteSearchBarComponent } from "./InviteSearchBar.types";

export const InviteSearchBar: InviteSearchBarComponent = ({
	ref,
	placeholder,
	onChangeText,
}) => {
	const theme = useTheme();
	const inputRef = useRef<TextInputInstance>(null);
	useImperativeHandle(ref, () => ({
		focus: () => inputRef.current?.focus(),
		clearText: () => inputRef.current?.clear(),
	}));
	return (
		<View className="px-4 pb-2 pt-2">
			<TextInput
				ref={inputRef}
				className="bg-input/30 border-input text-foreground min-h-10 rounded-md border px-3 py-2 text-base"
				placeholder={placeholder}
				placeholderTextColor={theme.mutedForeground}
				inputMode="email"
				autoCapitalize="none"
				autoCorrect={false}
				onChangeText={onChangeText}
			/>
		</View>
	);
};
