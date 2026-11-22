import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { AsciiSpinner } from "@/screens/(authenticated)/components/AsciiSpinner";
import { PingDot } from "@/screens/(authenticated)/components/PingDot";
import type { TerminalAttention } from "../../../../hooks/useHostTerminals";

interface WorkspaceLeadProps {
	attention: TerminalAttention | null;
	creating: boolean;
	failed: boolean;
	pullRequest?: {
		icon: LucideIcon;
		ink: string;
		label: string;
		onPress: () => void;
	} | null;
}

/**
 * One mark by desktop's precedence (DashboardSidebarWorkspaceLeadIndicator):
 * a failed or unborn box, then live agent state, then PR state, then idle.
 */
export function WorkspaceLead({
	attention,
	creating,
	failed,
	pullRequest,
}: WorkspaceLeadProps) {
	return (
		<View className="size-6 items-center justify-center">
			{failed || attention === "failed" ? (
				<PingDot color="#ef4444" size={8} />
			) : creating || attention === "working" ? (
				<AsciiSpinner />
			) : attention === "permission" ? (
				<PingDot color="#eab308" size={8} />
			) : attention === "review" ? (
				<View className="bg-green-500 size-2 rounded-full" />
			) : pullRequest ? (
				<Button
					accessibilityLabel={pullRequest.label}
					ph-label="workspace-row-pull-request"
					variant="ghost"
					size="icon"
					className="size-6"
					hitSlop={8}
					onPress={pullRequest.onPress}
				>
					<Icon
						as={pullRequest.icon}
						className={`size-4 ${pullRequest.ink}`}
						strokeWidth={2}
					/>
				</Button>
			) : (
				<View className="bg-muted-foreground/50 size-1.5 rounded-full" />
			)}
		</View>
	);
}
