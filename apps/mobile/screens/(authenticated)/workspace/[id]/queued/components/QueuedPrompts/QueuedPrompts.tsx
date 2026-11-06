import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
	countLines,
	firstLine,
	parsePastedText,
	userMessageText,
} from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

interface QueuedPromptsProps {
	prompts: UserMessage[];
	paused: boolean;
	actionable: boolean;
	onSteer: (itemId: string) => void;
	onRemove: (itemId: string) => void;
	onResume: () => void;
}

export function QueuedPrompts({
	prompts,
	paused,
	actionable,
	onSteer,
	onRemove,
	onResume,
}: QueuedPromptsProps) {
	const { t } = useLingui();
	return (
		<View className="gap-1">
			{paused ? (
				<View className="mb-2 flex-row items-center gap-3 rounded-2xl bg-white/5 px-3.5 py-3">
					<Text className="text-muted-foreground min-w-0 flex-1 text-[13px]">
						<Trans>Queue paused because you interrupted</Trans>
					</Text>
					{actionable ? (
						<Pressable
							accessibilityRole="button"
							className="rounded-full bg-white/10 px-3 py-1.5 active:opacity-70"
							onPress={onResume}
						>
							<Text className="text-foreground text-[13px] font-medium">
								<Trans>Resume</Trans>
							</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
			{prompts.map((prompt) => {
				const { text, pastes } = parsePastedText(userMessageText(prompt));
				const label = (text || firstLine(pastes[0] ?? "")).replace(/\n/g, " ");
				const lines = pastes.reduce((sum, paste) => sum + countLines(paste), 0);
				return (
					<View className="flex-row items-center gap-3 py-2.5" key={prompt.id}>
						<Text
							className="text-foreground min-w-0 flex-1 text-[15px]"
							numberOfLines={3}
						>
							{label}
							{lines > 0 ? (
								<Text className="text-muted-foreground text-[13px]">
									{" · "}
									<Plural value={lines} one="# line" other="# lines" />
								</Text>
							) : null}
						</Text>
						{actionable ? (
							<>
								<Pressable
									accessibilityHint={t({
										message: "Stops the agent and sends this now",
									})}
									accessibilityRole="button"
									className="rounded-full bg-white px-3 py-1.5 active:opacity-70"
									onPress={() => onSteer(prompt.id)}
								>
									<Text className="text-[13px] font-medium text-black">
										<Trans>Send now</Trans>
									</Text>
								</Pressable>
								<Pressable
									accessibilityLabel={t({ message: "Delete" })}
									accessibilityRole="button"
									className="size-8 items-center justify-center active:opacity-60"
									hitSlop={4}
									onPress={() => onRemove(prompt.id)}
								>
									<Icon as={Trash2} className="text-muted-foreground size-4" />
								</Pressable>
							</>
						) : null}
					</View>
				);
			})}
		</View>
	);
}
