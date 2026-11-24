import Ionicons from "@expo/vector-icons/Ionicons";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/useTheme";
import { HeaderToolbar } from "@/lib/navigation";
import { SheetRow } from "@/screens/(authenticated)/(home)/filter/components/SheetRow";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useScopeLabel } from "@/screens/(authenticated)/(home)/hooks/useScopeLabel";
import { useScopeSelection } from "@/screens/(authenticated)/(home)/hooks/useScopeSelection";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";

export function FilterScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const { scope, selectedHost } = useScopeSelection();
	const scopeLabel = useScopeLabel();
	const cloud = scope === "cloud";
	const sort = useWorkspacesFilterStore((store) => store.sort);

	const sortOption = SORT_OPTIONS.find((option) => option.value === sort);
	const sortLabel = sortOption ? i18n._(sortOption.label) : "";

	return (
		<View className="bg-background flex-1">
			<HeaderToolbar placement="left">
				<HeaderToolbar.Button
					icon="close"
					accessibilityLabel={t({ message: "Close" })}
					onPress={() => router.back()}
				/>
			</HeaderToolbar>
			<SheetRow
				icon={
					<Ionicons
						name="desktop-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label={t({ message: "Scope" })}
				trailing={
					<ListRowValue
						value={scopeLabel}
						accessory={
							cloud ? (
								<Icon
									as={CloudIcon}
									className="text-muted-foreground size-4"
									strokeWidth={2}
								/>
							) : selectedHost ? (
								<HostStatusDot isOnline={selectedHost.isOnline} />
							) : undefined
						}
					/>
				}
				onPress={() => router.push("/(authenticated)/(home)/filter/scope")}
			/>
			<SheetRow
				icon={
					<Ionicons
						name="swap-vertical"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label={t({ message: "Sort" })}
				trailing={<ListRowValue value={sortLabel} />}
				onPress={() => router.push("/(authenticated)/(home)/filter/sort")}
				isLast
			/>
		</View>
	);
}
