import { useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Text } from "@/components/ui/text";
import type { PageRowMenuProps } from "./PageRowMenu.types";

export function PageRowMenu({ actions, onShare, children }: PageRowMenuProps) {
	const { t } = useLingui();
	return (
		<ContextMenu>
			<ContextMenuTrigger>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem onPress={onShare}>
					<Text>{t({ message: "Share" })}</Text>
				</ContextMenuItem>
				{actions ? (
					<ContextMenuItem onPress={actions.duplicate}>
						<Text>{t({ message: "Duplicate" })}</Text>
					</ContextMenuItem>
				) : null}
				{actions?.rename ? (
					<ContextMenuItem onPress={actions.rename}>
						<Text>{t({ message: "Rename" })}</Text>
					</ContextMenuItem>
				) : null}
				{actions?.remove ? (
					<ContextMenuItem variant="destructive" onPress={actions.remove}>
						<Text>{t({ message: "Delete" })}</Text>
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
