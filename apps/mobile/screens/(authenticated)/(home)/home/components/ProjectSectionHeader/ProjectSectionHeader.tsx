import { useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnlargedText } from "@/hooks/useEnlargedText";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import { useAttentionLabel } from "../../hooks/useAttentionLabel";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import { AttentionMark } from "../AttentionMark";

interface ProjectSectionHeaderProps {
	name: string;
	iconUrl?: string | null;
	/** Replaces the project avatar for sections that aren't a project. */
	icon?: ReactNode;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
	onNewWorkspace?: () => void;
	/** The most urgent state of the rows a collapsed project hides. */
	attention?: TerminalAttention | null;
}

/**
 * Reads as the parent of the rows under it through weight, as on desktop,
 * rather than through caps and letterspacing. The count is what keeps a
 * collapsed section informative.
 */
export function ProjectSectionHeader({
	name,
	iconUrl,
	icon,
	count,
	collapsed,
	onToggle,
	onNewWorkspace,
	attention,
}: ProjectSectionHeaderProps) {
	const attentionLabel = useAttentionLabel();
	const { t } = useLingui();
	const theme = useTheme();
	const enlargedText = useEnlargedText();
	const Caret = collapsed ? ChevronRight : ChevronDown;
	return (
		// The collapse target and the "+" are siblings on purpose: a control
		// nested inside an accessible Pressable is folded into its parent and
		// VoiceOver never reaches it.
		<View className="flex-row items-center px-3 pt-4">
			<Pressable
				onPress={onToggle}
				accessibilityLabel={[
					`${name}, ${count} ${count === 1 ? "workspace" : "workspaces"}`,
					attention ? attentionLabel(attention) : null,
				]
					.filter(Boolean)
					.join(", ")}
				accessibilityState={{ expanded: !collapsed }}
				className="web:hover:opacity-80 min-h-11 flex-1 flex-row items-center gap-3 active:opacity-60"
			>
				<View className="size-6 items-center justify-center">
					{icon ?? <ProjectAvatar name={name} iconUrl={iconUrl} size={20} />}
				</View>
				<Text
					className="shrink text-[17px] font-semibold"
					numberOfLines={enlargedText ? undefined : 1}
				>
					{name}
				</Text>
				<Text className="text-muted-foreground font-mono text-[13px]">
					{count}
				</Text>
				{/* Two icons rather than one rotated: a transform on the icon itself
				    doesn't reach the underlying SVG, so it renders nothing. */}
				<Caret size={12} color={theme.mutedForeground} strokeWidth={2.5} />
				{attention ? <AttentionMark attention={attention} /> : null}
			</Pressable>
			{onNewWorkspace ? (
				<Button
					accessibilityLabel={t({
						message: `New workspace in ${name}`,
					})}
					ph-label="project-header-new-workspace"
					variant="ghost"
					size="icon"
					className="size-6"
					hitSlop={8}
					onPress={onNewWorkspace}
				>
					<Icon as={Plus} className="text-muted-foreground size-5" />
				</Button>
			) : null}
		</View>
	);
}
