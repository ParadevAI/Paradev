import { Chip } from "@superset/chat-ui/Chip";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import { LinkHoverCard } from "../../../../../../../LinkHoverCard";
import { LinkMenu } from "../../../../../../../LinkMenu";

const WEB_URL = /^https?:\/\//i;

/**
 * A chip in a sent message, drawn as the composer drew it. One that points at a
 * web page opens it, has the link's hover card and its right-click menu.
 */
export function MessageChip({
	chip,
	link,
}: {
	chip: ComposerChip;
	link?: string | undefined;
}) {
	const { openLink } = useChatPaneActions();
	const href =
		link ?? (WEB_URL.test(chip.serialized) ? chip.serialized : undefined);
	if (!href) return <Chip chip={chip} />;
	return (
		<LinkHoverCard link={href}>
			<LinkMenu href={href}>
				<a
					className="no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					href={href}
					onClick={(event) => {
						if (openLink?.(href, event)) event.preventDefault();
					}}
					rel="noreferrer"
					target="_blank"
				>
					<Chip chip={chip} tooltip={false} />
				</a>
			</LinkMenu>
		</LinkHoverCard>
	);
}
