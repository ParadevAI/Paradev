import { useLingui } from "@lingui/react/macro";
import type { AlertButton } from "react-native";
import { Modal, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { settleAlert, usePendingAlert } from "../../alertQueue";

/** Draws `Alert.alert` with all its buttons where the OS has no alert. */
export function AlertHost() {
	const pending = usePendingAlert();
	const { t } = useLingui();
	if (!pending) return null;

	const buttons: AlertButton[] = pending.buttons.length
		? pending.buttons
		: [{ text: t({ message: "OK" }) }];
	const cancel = buttons.find((button) => button.style === "cancel");
	const stacked = buttons.length > 2;
	const dismiss = () => {
		if (cancel) settleAlert(cancel);
		else if (pending.options?.cancelable) {
			settleAlert(undefined);
			pending.options.onDismiss?.();
		}
	};

	return (
		<Modal
			transparent
			visible
			animationType="fade"
			statusBarTranslucent
			onRequestClose={dismiss}
		>
			<View className="flex-1 items-center justify-center bg-black/60 px-8">
				<View
					accessibilityElementsHidden
					className="absolute inset-0"
					onResponderRelease={dismiss}
					onStartShouldSetResponder={() => true}
				/>
				<View
					accessibilityRole="alert"
					className="bg-popover border-border w-full max-w-xs overflow-hidden rounded-3xl border"
				>
					{pending.title || pending.message ? (
						<View className="gap-1.5 px-5 pb-4 pt-5">
							{pending.title ? (
								<Text className="text-foreground text-center text-base font-semibold">
									{pending.title}
								</Text>
							) : null}
							{pending.message ? (
								<Text className="text-muted-foreground text-center text-sm">
									{pending.message}
								</Text>
							) : null}
						</View>
					) : null}
					<View
						className={cn(
							"border-border",
							(pending.title || pending.message) && "border-t",
							stacked ? "flex-col" : "flex-row",
						)}
					>
						{buttons.map((button, index) => (
							<Pressable
								// biome-ignore lint/suspicious/noArrayIndexKey: buttons have no identity beyond their order
								key={index}
								accessibilityRole="button"
								onPress={() => settleAlert(button)}
								className={cn(
									"active:bg-accent hover:bg-accent min-h-12 flex-1 items-center justify-center px-4 py-3",
									index > 0 &&
										(stacked
											? "border-border border-t"
											: "border-border border-l"),
								)}
							>
								<Text
									className={cn(
										"text-base",
										button.style === "destructive"
											? "text-destructive"
											: "text-foreground",
										button.style === "cancel" && "font-semibold",
									)}
								>
									{button.text}
								</Text>
							</Pressable>
						))}
					</View>
				</View>
			</View>
		</Modal>
	);
}
