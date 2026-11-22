import { useLingui } from "@lingui/react/macro";
import { type NativeStackHeaderProps, Stack } from "expo-router";
import { X } from "lucide-react-native";
import { useCallback, useImperativeHandle, useRef } from "react";
import {
	Pressable,
	TextInput,
	type TextInputInstance,
	View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/useTheme";
import { SheetHeaderSlot } from "@/lib/navigation";
import { focusOnMount } from "./focusOnMount";
import type { SearchBarComponent } from "./SearchBar.types";

/** A form sheet draws no native bar here, so the field is the header, drawn in JS. */
export const SearchBar: SearchBarComponent = ({
	ref,
	placeholder,
	onChangeText,
	onSubmit,
	onClose,
}) => {
	const { t } = useLingui();
	const theme = useTheme();
	const inputRef = useRef<TextInputInstance>(null);
	useImperativeHandle(ref, () => ({
		focus: () => inputRef.current?.focus(),
	}));
	const header = useCallback(
		({ options }: NativeStackHeaderProps) => (
			<SheetHeaderSlot options={options}>
				<View className="bg-background gap-2 px-4 pb-2 pt-2">
					<View className="bg-muted-foreground/40 web:hidden h-1 w-8 self-center rounded-full" />
					<View className="flex-row items-center gap-2">
						<TextInput
							ref={inputRef}
							className="bg-input/30 border-input text-foreground min-h-10 flex-1 rounded-md border px-3 py-2 text-base"
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
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t({ message: "Close" })}
							hitSlop={8}
							onPress={onClose}
							className="web:hover:bg-accent active:bg-accent size-10 items-center justify-center rounded-full"
						>
							<Icon as={X} className="text-foreground size-5" />
						</Pressable>
					</View>
				</View>
			</SheetHeaderSlot>
		),
		[placeholder, onChangeText, onSubmit, onClose, theme, t],
	);
	return <Stack.Screen options={{ header }} />;
};
