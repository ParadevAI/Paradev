import { Plural } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { FolderGit2 } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export const CheckoutHeaderRow = memo(function CheckoutHeaderRow({
	name,
	additions,
	deletions,
	fileCount,
}: {
	name: string;
	additions: number;
	deletions: number;
	fileCount: number;
}) {
	const { formatNumber } = useFormat();
	return (
		<View className="bg-muted/40 flex-row items-center gap-2 px-4 pb-2 pt-5">
			<Icon as={FolderGit2} className="text-muted-foreground size-4" />
			<Text
				className="min-w-0 flex-1 font-semibold text-[14px]"
				numberOfLines={1}
			>
				{name}
			</Text>
			<Text className="text-muted-foreground text-[12px]">
				<Plural value={fileCount} one="# file" other="# files" />
			</Text>
			{additions > 0 ? (
				<Text className="text-green-500 font-medium text-[12px]">
					+{formatNumber(additions)}
				</Text>
			) : null}
			{deletions > 0 ? (
				<Text className="text-red-500 font-medium text-[12px]">
					−{formatNumber(deletions)}
				</Text>
			) : null}
		</View>
	);
});
