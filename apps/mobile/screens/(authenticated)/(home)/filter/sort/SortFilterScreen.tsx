import { i18n } from "@superset/i18n";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { posthog } from "@/lib/posthog";
import { SheetRow } from "@/screens/(authenticated)/(home)/filter/components/SheetRow";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

export function SortFilterScreen() {
	const router = useRouter();
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const setSort = useWorkspacesFilterStore((store) => store.setSort);

	return (
		<View className="bg-background flex-1">
			{SORT_OPTIONS.map((option, index) => (
				<SheetRow
					key={option.value}
					label={i18n._(option.label)}
					checked={option.value === sort}
					onPress={() => {
						setSort(option.value);
						posthog.capture("filter_applied", {
							filter: "sort",
							value: option.value,
						});
						router.back();
					}}
					isLast={index === SORT_OPTIONS.length - 1}
				/>
			))}
		</View>
	);
}
