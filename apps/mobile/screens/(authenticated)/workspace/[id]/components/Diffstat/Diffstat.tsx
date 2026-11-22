import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { PullRequestDiffstat } from "../../hooks/usePullRequestDiffstat";

export function Diffstat({
	additions,
	deletions,
	className,
}: PullRequestDiffstat & { className?: string }) {
	return (
		<View className="flex-row items-center gap-1">
			<Text className={cn("text-green-500 text-[13px]", className)}>
				+{additions}
			</Text>
			<Text className={cn("text-red-500 text-[13px]", className)}>
				−{deletions}
			</Text>
		</View>
	);
}
