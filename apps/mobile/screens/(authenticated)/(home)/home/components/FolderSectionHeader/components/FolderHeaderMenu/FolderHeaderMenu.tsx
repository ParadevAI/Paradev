import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Check, Ellipsis } from "lucide-react-native";
import { View } from "react-native";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { GROUP_COLORS } from "./constants";
import type { FolderHeaderMenuComponent } from "./FolderHeaderMenu.types";

export const FolderHeaderMenu: FolderHeaderMenuComponent = ({
	color,
	onRename,
	onSetColor,
	onDelete,
}) => {
	const { t } = useLingui();
	const colors = [
		{ value: null, label: t({ message: "Default" }) },
		...GROUP_COLORS.map((option) => ({
			value: option.value,
			label: i18n._(option.label),
		})),
	];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				accessibilityLabel={t({ message: "Group actions" })}
				className="size-9 items-center justify-center"
			>
				<Icon as={Ellipsis} className="text-muted-foreground size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuItem onPress={onRename}>
					<Text>{t({ message: "Rename group" })}</Text>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel>
					{t({ message: "Set group color" })}
				</DropdownMenuLabel>
				{colors.map((option) => (
					<DropdownMenuItem
						key={option.value ?? "default"}
						onPress={() => onSetColor(option.value)}
					>
						<View className="size-4 items-center justify-center">
							{option.value === color ? (
								<Icon as={Check} className="size-4" />
							) : null}
						</View>
						<Text>{option.label}</Text>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onPress={onDelete}>
					<Text>{t({ message: "Delete group" })}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
