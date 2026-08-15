import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";

interface ProjectSectionHeaderProps {
	name: string;
	iconUrl?: string | null;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
}

/**
 * A quiet band, not a title: the workspaces under it are what you came to tap,
 * so the header labels them rather than competing with them. The count is what
 * keeps a collapsed section informative.
 */
export function ProjectSectionHeader({
	name,
	iconUrl,
	count,
	collapsed,
	onToggle,
}: ProjectSectionHeaderProps) {
	const theme = useTheme();
	const Caret = collapsed ? ChevronRight : ChevronDown;
	return (
		<Pressable
			onPress={onToggle}
			accessibilityLabel={`${name}, ${count} workspaces`}
			accessibilityState={{ expanded: !collapsed }}
			className="flex-row items-center gap-2.5 px-4 pb-1 pt-4 active:opacity-60"
		>
			{/* Two icons rather than one rotated: a transform on the icon itself
			    doesn't reach the underlying SVG, so it renders nothing. */}
			<Caret size={14} color={theme.mutedForeground} strokeWidth={2.5} />
			<View className="size-6 items-center justify-center">
				<ProjectAvatar name={name} iconUrl={iconUrl} size={20} />
			</View>
			<Text
				className="text-foreground font-semibold text-[15px] uppercase tracking-wider"
				numberOfLines={1}
			>
				{name}
			</Text>
			<Text className="text-muted-foreground font-mono text-[13px]">
				{count}
			</Text>
		</Pressable>
	);
}
