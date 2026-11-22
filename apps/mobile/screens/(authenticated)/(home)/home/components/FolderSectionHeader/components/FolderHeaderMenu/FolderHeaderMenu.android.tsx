import MenuView from "@expo/ui/community/menu";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Ellipsis } from "lucide-react-native";
import { View } from "react-native";
import { useUniwind } from "uniwind";
import { Icon } from "@/components/ui/icon";
import { MENU_ICON } from "@/lib/menu-icons";
import { GROUP_COLORS } from "./constants";
import type { FolderHeaderMenuComponent } from "./FolderHeaderMenu.types";

export const FolderHeaderMenu: FolderHeaderMenuComponent = ({
	color,
	onRename,
	onSetColor,
	onDelete,
}) => {
	const { t } = useLingui();
	const { theme } = useUniwind();
	const colors = [
		{ value: null, title: t({ message: "None" }) },
		...GROUP_COLORS.map((option) => ({
			value: option.value,
			title: i18n._(option.label),
		})),
	];
	return (
		<MenuView
			colorScheme={theme}
			actions={[
				{
					id: "rename",
					title: t({ message: "Rename group" }),
					image: MENU_ICON.edit,
				},
				{
					id: "color",
					title: t({ message: "Set group color" }),
					subactions: colors.map((option) => ({
						id: `color:${option.value ?? ""}`,
						title: option.title,
						state: option.value === color ? "on" : "off",
					})),
				},
				{
					id: "delete",
					title: t({ message: "Delete group" }),
					image: MENU_ICON.delete,
					attributes: { destructive: true },
				},
			]}
			onPressAction={({ nativeEvent }) => {
				const { event } = nativeEvent;
				if (event === "rename") onRename();
				else if (event === "delete") onDelete();
				else if (event.startsWith("color:")) {
					onSetColor(event.slice("color:".length) || null);
				}
			}}
		>
			<View
				accessible
				accessibilityRole="button"
				accessibilityLabel={t({ message: "Group actions" })}
				className="size-9 items-center justify-center"
			>
				<Icon as={Ellipsis} className="text-muted-foreground size-4" />
			</View>
		</MenuView>
	);
};
