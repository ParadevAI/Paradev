import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import type { AlertPromptHostComponent, Prompt } from "./AlertPrompt.types";
import { enqueuePrompt, settlePrompt, usePendingPrompt } from "./promptQueue";

export const prompt: Prompt = enqueuePrompt;

export const AlertPromptHost: AlertPromptHostComponent = () => {
	const pending = usePendingPrompt();
	const { t } = useLingui();
	const [value, setValue] = useState("");

	useEffect(() => {
		setValue(pending?.options.defaultValue ?? "");
	}, [pending]);

	if (!pending) return null;
	const { options } = pending;
	const cancel = () => settlePrompt(null);
	const confirm = () => settlePrompt(value);

	return (
		<Modal
			transparent
			visible
			animationType="fade"
			statusBarTranslucent
			onRequestClose={cancel}
		>
			<KeyboardAvoidingView
				behavior="padding"
				className="flex-1 items-center justify-center bg-black/60 px-8"
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={options.cancelText ?? t({ message: "Cancel" })}
					className="absolute inset-0"
					onPress={cancel}
				/>
				<View className="bg-popover border-border w-full max-w-sm gap-4 rounded-3xl border p-6">
					<View className="gap-2">
						<Text className="text-foreground text-lg font-semibold">
							{options.title}
						</Text>
						{options.message ? (
							<Text className="text-muted-foreground text-sm">
								{options.message}
							</Text>
						) : null}
					</View>
					<Input
						autoFocus
						value={value}
						onChangeText={setValue}
						placeholder={options.placeholder}
						selectTextOnFocus={options.selectText}
						returnKeyType="done"
						onSubmitEditing={confirm}
					/>
					<View className="flex-row justify-end gap-2">
						<Pressable
							accessibilityRole="button"
							className="active:bg-accent h-10 justify-center rounded-full px-4"
							onPress={cancel}
						>
							<Text className="text-muted-foreground text-sm font-medium">
								{options.cancelText ?? t({ message: "Cancel" })}
							</Text>
						</Pressable>
						<Pressable
							accessibilityRole="button"
							className="active:bg-accent h-10 justify-center rounded-full px-4"
							onPress={confirm}
						>
							<Text className="text-foreground text-sm font-semibold">
								{options.confirmText ?? t({ message: "OK" })}
							</Text>
						</Pressable>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
};
