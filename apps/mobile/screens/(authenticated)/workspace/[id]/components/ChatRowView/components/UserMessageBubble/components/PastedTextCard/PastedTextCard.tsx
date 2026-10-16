import { Plural, Trans } from "@lingui/react/macro";
import { countLines, firstLine } from "@superset/chat/core";
import { FileText } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function PastedTextCard({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	const lines = countLines(text);
	return (
		<View className="gap-2">
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				className="flex-row items-center gap-2 rounded-[9px] bg-white/5 p-[7px]"
				onPress={() => setOpen((value) => !value)}
				style={{ borderCurve: "continuous" }}
			>
				<View
					className="size-7 items-center justify-center rounded-md bg-white/10"
					style={{ borderCurve: "continuous" }}
				>
					<Icon as={FileText} className="text-muted-foreground size-[14px]" />
				</View>
				<View className="min-w-0 flex-1">
					<Text
						className="text-foreground text-[13px] font-medium"
						numberOfLines={1}
					>
						{firstLine(text)}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{open ? <Trans>Hide text</Trans> : <Trans>Show text</Trans>}
						{" · "}
						<Plural value={lines} one="# line" other="# lines" />
					</Text>
				</View>
			</Pressable>
			{open ? (
				<ScrollView
					className="max-h-80 rounded-[9px] bg-white/5"
					contentContainerClassName="p-[9px]"
					nestedScrollEnabled
				>
					<Text className="text-foreground font-mono text-xs" selectable>
						{text}
					</Text>
				</ScrollView>
			) : null}
		</View>
	);
}
