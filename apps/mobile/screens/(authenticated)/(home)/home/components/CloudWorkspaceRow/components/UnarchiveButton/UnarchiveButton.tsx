import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { RotateCcw } from "lucide-react-native";
import { Alert, Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";

/** Unarchive in reach on an archived cloud row, instead of on hover. */
export function UnarchiveButton({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const { unarchive } = useCloudWorkspaceActions();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t({ message: "Unarchive workspace" })}
			hitSlop={8}
			className="size-6 items-center justify-center rounded-md active:opacity-60"
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				void unarchive(workspaceId).catch(() =>
					Alert.alert(t({ message: "Unarchive failed" })),
				);
			}}
			ph-label="cloud-row-unarchive"
		>
			<Icon as={RotateCcw} className="text-muted-foreground size-4" />
		</Pressable>
	);
}
