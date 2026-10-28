import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard } from "lucide-react";
import type { ReactNode } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { LinkAction } from "renderer/lib/clickPolicy";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

const NO_MODIFIERS = {
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	clientX: 0,
	clientY: 0,
};

/**
 * The right-click menu of a file the agent named: where to open it, and its
 * reference (`path:line`) to copy.
 */
export function FileLinkMenu({
	children,
	reference,
}: {
	children: ReactNode;
	reference: string;
}) {
	const { t } = useLingui();
	const { openLink } = useChatPaneActions();
	const { copyToClipboard } = useCopyToClipboard();
	if (!openLink) return children;
	const open = (action: LinkAction) =>
		openLink(reference, NO_MODIFIERS, action);
	const copy = () => {
		void copyToClipboard(reference).then(
			() => toast.success(t({ message: "Path copied" })),
			() => toast.error(t({ message: "Couldn't copy path" })),
		);
	};
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<Trans>Open in</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem onSelect={() => open("pane")}>
							<Trans>Tab</Trans>
						</ContextMenuItem>
						<ContextMenuItem onSelect={() => open("newTab")}>
							<Trans>New Tab</Trans>
						</ContextMenuItem>
						<ContextMenuItem onSelect={() => open("external")}>
							<Trans>Editor</Trans>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={copy}>
					<Clipboard />
					<Trans>Copy Path</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
