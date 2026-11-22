import { Trans } from "@lingui/react/macro";
import { Bot } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function AskerLabel({ name }: { name: string }) {
	return (
		<View className="flex-row items-center gap-1.5">
			<Icon as={Bot} className="text-muted-foreground size-3" />
			<Text className="text-muted-foreground text-xs">
				<Trans>{name} asks</Trans>
			</Text>
		</View>
	);
}
