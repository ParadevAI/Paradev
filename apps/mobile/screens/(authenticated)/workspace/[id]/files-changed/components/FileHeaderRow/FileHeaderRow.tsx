import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown, ChevronRight, Circle } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { ChangesetFile } from "../../../hooks/useWorkspaceChangeset";
import { FILE_HEADER_HEIGHT } from "../../utils/diffMetrics";
import { FileActionsMenu } from "./components/FileActionsMenu";

export const FileHeaderRow = memo(function FileHeaderRow({
	file,
	expanded,
	viewed,
	onToggle,
	onCopyPath,
	onViewFile,
	onAddComment,
	onDelete,
	onToggleViewed,
}: {
	file: ChangesetFile;
	expanded: boolean;
	viewed: boolean;
	onToggle: (path: string) => void;
	onCopyPath: (file: ChangesetFile) => void;
	onViewFile: (file: ChangesetFile) => void;
	onAddComment: (file: ChangesetFile) => void;
	onDelete: (file: ChangesetFile) => void;
	onToggleViewed: (path: string) => void;
}) {
	const { t } = useLingui();
	return (
		<View
			className="bg-background border-border/60 flex-row items-center gap-3 border-t border-b px-4"
			style={{ height: FILE_HEADER_HEIGHT }}
		>
			<PressableScale
				className="min-w-0 flex-1 flex-row items-center gap-3 self-stretch"
				onPress={() => onToggle(file.path)}
			>
				<Icon
					as={expanded ? ChevronDown : ChevronRight}
					className="text-muted-foreground size-[18px]"
				/>
				<Text
					className="text-foreground/80 min-w-0 flex-1 font-mono text-[13px]"
					numberOfLines={1}
				>
					{file.path}
				</Text>
			</PressableScale>
			<View className="bg-border h-5 w-px" />
			<FileActionsMenu
				onCopyPath={() => onCopyPath(file)}
				onViewFile={() => onViewFile(file)}
				onAddComment={() => onAddComment(file)}
				onDelete={() => onDelete(file)}
			/>
			<PressableScale
				accessibilityLabel={
					viewed
						? t({
								message: "Mark as not viewed",
							})
						: t({
								message: "Mark as viewed",
							})
				}
				hitSlop={8}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					onToggleViewed(file.path);
				}}
			>
				{viewed ? (
					// Filled disc with the check knocked out. Filling CheckCircle2
					// instead paints the tick in the same green as the disc it sits on.
					<View className="bg-green-500 size-[22px] items-center justify-center rounded-full">
						<Icon
							as={Check}
							className="text-background size-[14px]"
							strokeWidth={3}
						/>
					</View>
				) : (
					<Icon
						as={Circle}
						className="text-muted-foreground/60 size-[22px]"
						strokeWidth={1.5}
					/>
				)}
			</PressableScale>
		</View>
	);
});
