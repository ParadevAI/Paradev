import { Trans, useLingui } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard, ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

const WEB_URL = /^https?:\/\//i;
const NO_MODIFIERS = {
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	clientX: 0,
	clientY: 0,
};

/**
 * The right-click menu of a link in the chat: copy it, or open it in a browser.
 * Passes other props to the trigger, so a hover card can wrap it with `asChild`.
 */
export function LinkMenu({
	href,
	...triggerProps
}: ComponentProps<typeof ContextMenuTrigger> & { href: string }) {
	const { t } = useLingui();
	const { openLink } = useChatPaneActions();
	const { copyToClipboard } = useCopyToClipboard();
	const copy = () => {
		void copyToClipboard(href).then(
			() => toast.success(t({ message: "Link copied" })),
			() => toast.error(t({ message: "Couldn't copy link" })),
		);
	};
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild {...triggerProps} />
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={copy}>
					<Clipboard />
					<Trans>Copy Link</Trans>
				</ContextMenuItem>
				{openLink && WEB_URL.test(href) && (
					<ContextMenuItem
						onSelect={() => openLink(href, NO_MODIFIERS, "external")}
					>
						<ExternalLink />
						<Trans>Open in Browser</Trans>
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
