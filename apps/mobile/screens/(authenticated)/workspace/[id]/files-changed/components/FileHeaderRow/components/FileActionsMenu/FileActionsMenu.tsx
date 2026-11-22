import { useLingui } from "@lingui/react/macro";
import {
	Copy,
	Ellipsis,
	FileText,
	type LucideIcon,
	MessageSquareText,
	Trash2,
} from "lucide-react-native";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { FileActionsMenuComponent } from "./FileActionsMenu.types";

export const FileActionsMenu: FileActionsMenuComponent = ({
	onCopyPath,
	onViewFile,
	onAddComment,
	onDelete,
}) => {
	const { t } = useLingui();
	const actions: {
		key: string;
		label: string;
		icon: LucideIcon;
		onSelect: () => void;
		destructive?: boolean;
	}[] = [
		{
			key: "copy",
			label: t({ message: "Copy relative path" }),
			icon: Copy,
			onSelect: onCopyPath,
		},
		{
			key: "view",
			label: t({ message: "View file" }),
			icon: FileText,
			onSelect: onViewFile,
		},
		{
			key: "comment",
			label: t({ message: "Add file comment" }),
			icon: MessageSquareText,
			onSelect: onAddComment,
		},
		{
			key: "delete",
			label: t({ message: "Delete file" }),
			icon: Trash2,
			onSelect: onDelete,
			destructive: true,
		},
	];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="size-8 items-center justify-center">
				<Icon as={Ellipsis} className="text-muted-foreground size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{actions.map((action) => (
					<DropdownMenuItem
						key={action.key}
						variant={action.destructive ? "destructive" : "default"}
						onPress={action.onSelect}
					>
						<Icon
							as={action.icon}
							className={
								action.destructive ? "text-destructive size-4" : "size-4"
							}
						/>
						<Text>{action.label}</Text>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
