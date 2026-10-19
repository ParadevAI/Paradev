import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { usePullRequestDiffstat } from "../../../hooks/usePullRequestDiffstat";
import type { WorkspacePullRequest } from "../../../hooks/useWorkspacePullRequest";

/**
 * Renders nothing until the numbers exist — a placeholder would be a third
 * thing on the row.
 */
export function RowDiffstat({
	hostUrl,
	pullRequest,
	enabled,
}: {
	hostUrl: string | null;
	pullRequest: WorkspacePullRequest;
	/** The sheet caps how many rows fetch, so an old long history cannot fan
	 * out one GitHub call per row the moment the sheet opens. */
	enabled: boolean;
}) {
	const data = usePullRequestDiffstat({ hostUrl, pullRequest, enabled });

	if (!data) return null;
	return (
		<View className="flex-row items-center gap-1">
			<Text className="text-green-500 text-[13px]">+{data.additions}</Text>
			<Text className="text-red-500 text-[13px]">−{data.deletions}</Text>
		</View>
	);
}
