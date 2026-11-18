import MenuView from "@expo/ui/community/menu";
import { useLingui } from "@lingui/react/macro";
import { Ellipsis } from "lucide-react-native";
import { View } from "react-native";
import { useUniwind } from "uniwind";
import { Icon } from "@/components/ui/icon";
import { MENU_ICON } from "@/lib/menu-icons";
import type { FileActionsMenuComponent } from "./FileActionsMenu.types";

export const FileActionsMenu: FileActionsMenuComponent = ({
	onCopyPath,
	onViewFile,
	onAddComment,
	onDelete,
}) => {
	const { t } = useLingui();
	const { theme } = useUniwind();
	const actions = [
		{
			id: "copy",
			title: t({ message: "Copy relative path" }),
			image: MENU_ICON.copy,
			onSelect: onCopyPath,
		},
		{
			id: "view",
			title: t({ message: "View file" }),
			image: MENU_ICON.viewFile,
			onSelect: onViewFile,
		},
		{
			id: "comment",
			title: t({ message: "Add file comment" }),
			image: MENU_ICON.fileComment,
			onSelect: onAddComment,
		},
		{
			id: "delete",
			title: t({ message: "Delete file" }),
			image: MENU_ICON.delete,
			attributes: { destructive: true },
			onSelect: onDelete,
		},
	];
	return (
		<MenuView
			colorScheme={theme}
			actions={actions}
			onPressAction={({ nativeEvent }) =>
				actions.find((action) => action.id === nativeEvent.event)?.onSelect()
			}
		>
			<View
				accessible
				accessibilityRole="button"
				accessibilityLabel={t({ message: "File actions" })}
				className="size-8 items-center justify-center"
			>
				<Icon as={Ellipsis} className="text-muted-foreground size-4" />
			</View>
		</MenuView>
	);
};
