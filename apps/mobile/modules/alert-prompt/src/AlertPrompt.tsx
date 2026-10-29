import { useLingui } from "@lingui/react/macro";
import { useEffect, useState, useSyncExternalStore } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import type {
	AlertPromptHostComponent,
	Prompt,
	PromptOptions,
} from "./AlertPrompt.types";

interface PendingPrompt {
	options: PromptOptions;
	resolve: (value: string | null) => void;
}

const queue: PendingPrompt[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function emit() {
	for (const listener of listeners) listener();
}

const current = () => queue[0];

function settle(value: string | null) {
	const pending = queue.shift();
	pending?.resolve(value);
	emit();
}

export const prompt: Prompt = (options) =>
	new Promise((resolve) => {
		queue.push({ options, resolve });
		emit();
	});

export const AlertPromptHost: AlertPromptHostComponent = () => {
	const pending = useSyncExternalStore(subscribe, current, current);
	const { t } = useLingui();
	const [value, setValue] = useState("");

	useEffect(() => {
		setValue(pending?.options.defaultValue ?? "");
	}, [pending]);

	if (!pending) return null;
	const { options } = pending;
	const cancel = () => settle(null);
	const confirm = () => settle(value);

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
